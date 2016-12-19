const host = 'localhost';
const port = 8080;
const webcam_endpoint = '/webcam';

const http = require('http').Server;
const spawn = require('child_process').spawn;
const index = require('fs')
  .readFileSync('index.html')
  .toString()
  .replace(/{{webcam_endpoint}}/, webcam_endpoint);

const command = 'avconv';
const flags = '-f video4linux2 -i /dev/video0 -f webm pipe:1'.split(' ');

const server = http((req, res) => {
  console.log('[REQUEST] %s %s', req.method, req.url);

  if(req.url === webcam_endpoint) {
    const video_encoding = spawn(command, flags);
    video_encoding.stderr.pipe(process.stderr);

    res.writeHead(200, { 'Content-Type': 'video/webm' });
    video_encoding.stdout.pipe(res);

    res.on('close', () => video_encoding.kill('SIGTERM'));
  } else {
    res.end(index);
  }
}).listen(port);
