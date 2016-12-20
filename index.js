/* REST service config */
const host = 'localhost';
const port = 8080;
const webcam_endpoint = '/webcam';
const get_key_endpoint = '/get_key';

/* Multimedia framework (gstreamer, ffmpeg, avlib, etc) config */
const command = 'avconv';
const flags = (webcam) => ['-f', 'video4linux2', '-i', webcam, '-f', 'webm', '-deadline', 'realtime', 'pipe:1'];
const mime_type = 'video/webm';

function start_transcoding(proc) {
  return new Promise((accept, reject) => {
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (data) => {
      /* Confío que el output es line buffered y que no va a haber otros errores
       *   dicho en criollo: tengo que revisar esto más tarde
       */
      const error = /\/dev\/video0: Input\/output error/;
      const started = /Press ctrl-c to stop encoding/;
      if(error.test(data)) {
        reject(error);
      } else if(started.test(data)) {
        accept(proc.stdout);
      }
    })
  });
}

/* Requires */
const http = require('http').Server;
const spawn = require('child_process').spawn;
const parse_url = require('url').parse;
const messages = require('./rest_messages');
const gen_uuid = require('uuid');

/* Static data */
const index = require('fs')
  .readFileSync('index.html')
  .toString()
  .replace(/{{webcam_endpoint}}/, webcam_endpoint)
  .replace(/{{get_key_endpoint}}/, get_key_endpoint);

/* Utility functions */
function file_exists(file) {
  const access = require('fs').access;

  return new Promise((accept, reject) => access(file, (err) => err ? reject(false) : accept(true)));
}

function is_valid_webcam(webcam) {
  const webcam_regex = /\/dev\/video[0-9]+/;

  return new Promise((accept, reject) => {
    /* Si no tiene pinta de webcam es un error */
    if(!webcam_regex.test(webcam)) {
      reject(false);
    } else {
      /* Si no existe el fichero también */
      file_exists(webcam).then(accept, reject);
    }
  });
}
function message(res, code, ...args) {
  const response = messages[code].apply(message, args);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(response);
}

/* Service state */
const webcam_status = {
};

/* REST api dispatch table */
const rest_api = {
  [get_key_endpoint]: (req, res, req_url) => {
    const webcam = req_url.query.webcam;
    let response;

    is_valid_webcam(webcam).then(() => {
      /* Si ya está ocupada es un error */
      if(webcam_status[webcam]) {
        message(res, 'already_in_use', webcam);
        return;
      }
      /* Genero el uuid para la cámara */
      let uuid = gen_uuid()

      webcam_status[webcam] = uuid; 
      message(res, 'get_key', uuid);
    }).catch((err) => {
      message(res, 'malformed_webcam', webcam)
    })
  },
  [webcam_endpoint]: (req, res, req_url) => {
    const webcam = req_url.query.webcam;
    const uuid = req_url.query.uuid;

    is_valid_webcam(webcam).then(() => {
      /* Si ya está ocupada es un error */
      if(webcam_status[webcam] !== uuid) {
        message(res, 'invalid_uuid', webcam, uuid);
        return;
      }
      /* Spawneo el transcoder */
      const video_encoder = spawn(command, flags(webcam));

      start_transcoding(video_encoder).then((video) => {
        res.writeHead(200, { 'Content-Type': mime_type });
        video.pipe(res);

        res.on('close', () => {
          video_encoder.kill('SIGTERM');
          webcam_status[webcam] = undefined; /* Libero la webcam */
        });

      }).catch(() => {
        message(res, 'already_in_use', webcam);
      });
    }).catch(() => {
      message(res, 'malformed_webcam', webcam)
    })
  },
  'default': (req, res) => {
    res.end(index);
  }
}

/* HTTP server */
const server = http((req, res) => {
  console.log('[REQUEST] %s %s', req.method, req.url);

  const req_url = parse_url(req.url, true);

  const process_request = rest_api[req_url.pathname] || rest_api.default;

  process_request(req, res, req_url)

}).listen(port);