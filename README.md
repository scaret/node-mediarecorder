# NodeJS MediaRecorder

### ChangeLog

##### 0.0.1 Init

- Only Support 1 video track, 0 audio track
- Only Support OSX.
- Consumes up to 1G memory

### Usage

```
const wrtc = require("wrtc");
const MediaRecorder = require("mediarecorder")(wrtc);
const getDisplayMedia = require("getdisplaymedia")(wrtc); // or any mediaStream defined by node-webrtc

const mediaStream = await getDisplayMedia({video: true});
const mediaRecorder = new MediaRecorder(mediaStream);
mediaRecorder.start();
mediaRecorder.ondataavailable = function(evt){
    console.log("Recorded file", evt.filePath);
};
```