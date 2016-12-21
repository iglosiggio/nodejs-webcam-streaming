/* This isn't a good example, i'm using it for testing the lib for my app */
require('./index')
  .createHTTPStreamingServer()
    .on('request', ({url}) => console.log(url))
    .listen(8080);
