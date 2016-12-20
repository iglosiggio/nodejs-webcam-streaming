const json = JSON.stringify;

exports.already_in_use = (webcam) => json({
  code: 'already_in_use',
  error: 'The webcam is already in use by another process',
  webcam: webcam
});
exports.get_key = (uuid) => json({
  key: uuid
});
exports.malformed_webcam = (webcam) => json({
  code: 'malformed_webcam',
  error: 'That webcam doesn\'t exist',
  webcam: webcam
});
exports.invalid_uuid = (webcam, uuid)  => json({
  code: 'invalid_uuid',
  error: 'That UUID is invalid',
  webcam: webcam,
  uuid: uuid
});