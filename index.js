/* Requires */
const http = require('http').Server;
const spawn = require('child_process').spawn;
const parseUrl = require('url').parse;
const messages = require('./rest_messages');

const defaultEncoder = {
  /*
   * encoder command or location
   */
  command: 'avconv',
  /*
   * Function that returns the required flags, the video is expected to be
   * written to stdout
   *
   * Note: for video size you have to use a string like
   *   `-f video4linux2 -video_size 1280x960 -i ${webcam} -f webm -deadline realtime pipe:1`
   * The other option is to scan the available resolutions and choose one based
   * on certain policy, the avlib/ffmpeg command for this is
   *   `-f video4linux2 -list_formats all -i ${webcam}`
   */
  flags(webcam) {
    return `-f video4linux2 -i ${webcam} -f webm -deadline realtime pipe:1`;
  },
  /*
   * MIME type of the output stream
   */
  mimeType: 'video/webm',
  /*
   * Function that detects the success of the encoder process,
   * does cb(true) in case of succes, any other value for failure
   *
   * Calling cb more than one time has no effect
   *
   * encoderProcess is of type ChildProcess
   *
   *  This default isn't perfect but covers most of the cases
   */
  isSuccessful(encoderProcess, cb) {
    let started = false;
    encoderProcess.stderr.setEncoding('utf8');
    encoderProcess.stderr.on('data', (data) => {
      /* I trust that the output is line-buffered */
      const startedText = /Press ctrl-c to stop encoding/;
      if(startedText.test(data)) {
        cb(true);
        started = true;
      }
    });
    /* If the process start was not detected and it exited it's surely a failure */
    encoderProcess.on('exit', () => {
      if(!started) cb(false);
    });
  }
};

/* Utility functions */
function fileExists(file) {
  const access = require('fs').access;

  return new Promise((accept, reject) => access(file, (err) => err ? reject(false) : accept(true)));
}

function isValidWebcamDefault(webcam) {
  const webcamRegex = /\/dev\/video[0-9]+/;

  return new Promise((accept, reject) => {
    /* Si no tiene pinta de webcam es un error */
    if(!webcamRegex.test(webcam)) {
      reject(false);
    } else {
      /* Si no existe el fichero también */
      fileExists(webcam).then(accept, reject);
    }
  });
}

/* Returns the isValidWebcam for a given whitelist */
function isValidWebcamWhitelist(whitelistArray) {
  const whitelist = {};
  /* We create the map*/
  whitelistArray.forEach((webcam) => whitelist[webcam] = 'valid');

  return (webcam) => new Promise((accept, reject) => webcam in whitelist? accept(true) : reject(false));
}

function defaultPage(req, res, req_url) {
  res.writeHead(404);
  res.end(`
    <!DOCTYPE html>
    <html>
      <head><title>４０４　ｎｏｔ－ｆｏｕｎｄ</title></head>
      <body><p>Ｓｏｒｒｙ，　ｗｅ　ｄｏｎ＇ｔ　ｋｎｏｗ　ｗｈａｔ　ｔｏ　ｄｏ</p></body>
    </html>
  `);
}

function fillDefaults(obj, defaults) {
  for(var key in defaults) {
    if(obj[key] === undefined)
      obj[key] = defaults[key];
  }
  return obj;
}

function message(res, code, ...args) {
  const response = messages[code].apply(message, args);
  res.writeHead(response.http_code, { 'Content-Type': 'application/json' });
  res.end(response.toString());
}

/*
 * This is the internal streamWebcam function, the returned promise resolves to
 * the spawned process
 */
function streamWebcam(webcam, {
  command = defaultEncoder.command,
  flags = defaultEncoder.flags,
  isSuccessful = defaultEncoder.isSuccessful
} = {}) {
  const encoderFlags = flags(webcam).split(' ');
  const videoEncoder = spawn(command, encoderFlags);

  return new Promise((accept, reject) => {
    /* Called when is determined if the encoder has succeeded */
    function resolveSucess(hasSucceeded) {
      if(hasSucceeded === true) accept(videoEncoder);
      else reject(hasSucceeded);
    }

    isSuccessful(videoEncoder, resolveSucess);
  });
}

exports.streamWebcam = (encoder) =>
  streamWebcam(encoder).then((encoderProcess) => encoderProcess.stdout);

const createHTTPStreamingServer = exports.createHTTPStreamingServer = ({
  permittedWebcams,
  isValidWebcam = isValidWebcamDefault,
  webcamEndpoint = '/webcam',
  additionalEndpoints = {},
  encoder = defaultEncoder
} = {}) => {
 additionalEndpoints[webcamEndpoint] = (req, res, reqUrl) => {
   const webcam = reqUrl.query.webcam;

   isValidWebcam(webcam).then(
     () => streamWebcam(webcam, encoder).then(
       (encoderProcess) => {
         const video = encoderProcess.stdout;

         res.writeHead(200, { 'Content-Type': encoder.mimeType });
         video.pipe(res);

         res.on('close', () => encoderProcess.kill('SIGTERM'));
         /* Sometimes the client disconnects but the encoder keeps running :\ */
         res.connection.on('close', () => encoderProcess.kill('SIGTERM'));
       }, () => message(res, 'webcam_in_use', webcam)),
     () => message(res, 'invalid_webcam', webcam));
 };

 additionalEndpoints.default = additionalEndpoints.default || defaultPage;
 fillDefaults(encoder, defaultEncoder);

 if(permittedWebcams) {
   isValidWebcam = isValidWebcamWhitelist(permittedWebcams);
 }

 const server = http((req, res) => {
   const reqUrl = parseUrl(req.url, true);
   const processRequest = additionalEndpoints[reqUrl.pathname] || additionalEndpoints.default;

   processRequest(req, res, reqUrl);
 });

 return server;
};
