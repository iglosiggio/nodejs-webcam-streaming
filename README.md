# webcam-http-streaming
Stream a webcam over http with node.js

# API

* **createHTTPStreamingServer(_[options]_)**: creates a [HTTP](https://nodejs.org/api/http.html#http_class_http_server)
  server ready for streaming yout webcams, the options are explained below
  (and are all optional)

* **streamWebcam(_[encoder]_)**: return the promise of a [Readable](https://nodejs.org/api/stream.html#stream_class_stream_readable)
  stream, defaults to avconv encodinf webm with realtime deadline

Given the flexibility of the API it _should_ be easy to use webcams on the
network or other types of realtime inputs, but keep in mind that the current
implementation spawns **one encoder per viewer** (it was made for a tool where
this limitation wasn't a problem).

Feel free to recommend me ways to overcome this difficulty :) i think that
MPEG-2 with [hsl.js](https://github.com/dailymotion/hls.js) or a similar lib may
be a good way to start.

### Complete API example
```js
const webcam = require('webcam-http-streaming');

const encoder = {
  /*
   * Transcoder command or location
   *   Default: avconv
   */
  command: 'ffmpeg',
  /*
   * Function that returns the required flags, the video is expected to be
   * written to stdout
   *   Default: shown below
   */
  flags(webcam) {
    return `-f video4linux2 -i ${webcam} -f webm -deadline realtime pipe:1`,
  },
  /*
   * MIME type of the output stream
   *   Default: 'video/webm'
   */
  mime_type: 'video/webm',
  /*
   * Function that detects the success of the encoder process,
   * does cb(true) in case of succes, any other value for failure
   *
   * Calling cb more than one time has no effect
   *
   * transcoder_process is of type ChildProcess
   *
   *  Default: shown below, it isn't perfect but covers most of the cases
   */
  is_successful(transcoder_process, cb) {
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (data) => {
      /* I trust that the output is line-buffered */
      const error = /\/dev\/video[0-9]+: Input\/output error/;
      const started = /Press ctrl-c to stop encoding/;
      if(started.test(data)) {
        cb(true);
      } else if(error.test(data)) {
        cb(false);
      }
    });
  }
};

/* Suppose i want to use the default REST API */
const server = webcam.createHTTPStreamingServer({
  /*
   * Optional: A list of the permitted webcams, if it's specified overrides
   * isValidWebcam
   */
  permittedWebcams: ['/dev/video0', '/dev/video1'],
  /*
   * Validates if a given path is a valid webcam for use, the default is shown
   * below
   */
  isValidWebcam(webcam) {
    const webcam_regex = /\/dev\/video[0-9]+/;

    return new Promise((accept, reject) => {
      /* If doesn't seem like a video device block we will fail */
      if(!webcam_regex.test(webcam)) {
        reject(false);
      } else {
        /* ... and if the file doesn't exists */
        file_exists(webcam).then(accept, reject);
      }
    });
  }
  aditionalEndpoints: {
    /* Custom endpoints to extend the REST API */
    '/list_webcams': (req, res, req_url) => { res.end('<html>...</html>'); }
  },
  encoder: encoder
}).listen(8080);

/* Returns a promise that resolves to the video stream (stream.Readable) */
const video_stream = webcam.streamWebcam('/dev/video0', encoder);
```

# Default REST API

* `/webcam?webcam=<webcam_device_block>`: Returns a _video/webm_ (by default, it
   can be changed) stream or an error (invalid_webcam, webcam_in_use by another
   process)

### Errors

* `invalid_webcam`: The webcam you requested hasn't been found or isn't in the
  list of permitted webcams
```json
  {
    "code": "invalid_webcam",
    "error": "That webcam doesn't exist",
    "webcam": "/dev/video0"
  }
```

* `webcam_in_use`: The webcam you requested was in use by another process
```json
  {
    "code": "webcam_in_use",
    "error": "The webcam is already in use by another process",
    "webcam": "/dev/video0"
  }
```
