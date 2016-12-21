const json = JSON.stringify;

exports.webcam_in_use = (webcam) => json({
  code: 'webcam_in_use',
  error: 'The webcam is already in use by another process',
  webcam: webcam
});
exports.invalid_webcam = (webcam) => json({
  code: 'invalid_webcam',
  error: 'That webcam doesn\'t exist',
  webcam: webcam
});
