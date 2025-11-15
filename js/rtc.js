
'use strict';

function isWebRTCSupported() {
  return !!(window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection);
}

if (!isWebRTCSupported()) {
  alert("❌ WebRTC is not supported");
}


const chatBox = document.querySelector(".chat-messages");
const sendBtn = document.getElementById("send");
const textInput = document.getElementById("textInput");
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const status = document.getElementById("status");

let fileMessageDiv;
let receivedFile;
let receiveBuffer = [];
let receivedSize = 0;

let connectionFailed = false;
let pc;
let fileDataChannel;
let textDataChannel;
let fileReader;

let wsPort = ":12345";
let wsAddr = "ws://" + window.location.hostname + wsPort + "/ws";

const ws = new WebSocket(wsAddr);

ws.onmessage = ev => {
  let data = JSON.parse(ev.data)

  switch (data.type) {
    case 'offer':
      handleOffer(data);
      break;
    case 'answer':
      handleAnswer(data);
      break;
    case 'candidate':
      handleCandidate(data);
      break;
    case 'ready':
      // A second tab joined. This tab will enable the buttons unless in a call already.
      if (pc) {
        console.log('already in call, ignoring');
        return;
      }
      startConnect();
      break;
    case 'bye':
      if (pc) {
        hangup();
      }
      break;
    default:
      console.log('unhandled', ev);
      break;
  }
};

ws.onopen = () => {
  ws.send(JSON.stringify({type: 'ready'}));
}

ws.onerror = (err) => {
  if (!pc) {
    console.error('WebSocket error:', err);
    status.innerText = `🔴 WebSocket error ${wsAddr}`
  }
}


function createPeerConnection(){
  connectionFailed = false;
  pc = new RTCPeerConnection();

  pc.onicecandidate = ev => {
    const message = {
      type: 'candidate',
      candidate: null,
    };
    if (ev.candidate) {
      message.candidate = ev.candidate.candidate;
      message.sdpMid = ev.candidate.sdpMid;
      message.sdpMLineIndex = ev.candidate.sdpMLineIndex;
    }
    ws.send(JSON.stringify(message));
  } 

  pc.onconnectionstatechange = (ev) => {
    console.log('Connection state:', pc.connectionState);

    switch (pc.connectionState) {
      case "new":
      case "connecting":
        status.innerText = "🔵 Connecting";
        break;
      case "connected":
        status.innerText = "🟢 Online";
        sendBtn.disabled = false;
        break;
      case "disconnected":
        status.innerText = "⚪ Reconnecting";
        sendBtn.disabled = true;
        break;
      case "failed":
        connectionFailed = true;
        closeDataChannels();
        status.innerText = `🔴 Connection failed`
        break;
    }
  }

}


async function startConnect(){
  createPeerConnection();

  textDataChannel = pc.createDataChannel("textDataChannel");
  fileDataChannel = pc.createDataChannel("fileDataChannel");
  fileDataChannel.binaryType = 'arraybuffer';

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({type: 'offer', sdp: offer.sdp})); 
 
  textDataChannel.addEventListener("message", (ev) => {
    onReceiveTextCallback(ev);
  });

  textDataChannel.addEventListener("close", () => {
    closeDataChannels();
    console.log(`${textDataChannel.label} closed by remote peer`);
    if (!connectionFailed) {
      status.innerText = "⚪ Peer disconnected";
    }
  });

  textDataChannel.addEventListener("open", () => {
    console.log(`${textDataChannel.label} established`);
  });

  fileDataChannel.addEventListener("message", (ev) => {
    onReceiveFileCallback(ev);
  });

  fileDataChannel.addEventListener("close", () => {
    closeDataChannels();
    console.log(`${textDataChannel.label} closed by remote peer`);
    if (!connectionFailed) {
      status.innerText = "⚪ Peer disconnected";
    }
  });

  fileDataChannel.addEventListener("open", () => {
    console.log(`${fileDataChannel.label} established`);
  });

}


async function handleOffer(offer){
  if (pc) {
    return
  }

  createPeerConnection();
  pc.ondatachannel = receiveChannelCallback;
  await pc.setRemoteDescription(offer);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  ws.send(JSON.stringify({type: 'answer', sdp: answer.sdp}));
}


async function handleAnswer(answer){
  if (!pc) {
    return
  }

  await pc.setRemoteDescription(answer);
}


async function handleCandidate(candidate){
  if (!pc) {
    return
  }

  if (!candidate.candidate) {
    // All candidates have been received
    await pc.addIceCandidate(null);
  } else {
    await pc.addIceCandidate(candidate);
  }
}


function receiveChannelCallback(ev){
  const channel = ev.channel;
  if (channel.label == "textDataChannel"){
    textDataChannel = channel;

    textDataChannel.addEventListener("message", (ev) => {
      onReceiveTextCallback(ev);
    });
  } else {
    fileDataChannel = channel;
    fileDataChannel.binaryType = 'arraybuffer';

    fileDataChannel.addEventListener("message", (ev) => {
      onReceiveFileCallback(ev);
    });
  }

  channel.addEventListener("close", () => {
    closeDataChannels();
    console.log(`${channel.label} closed by remote peer`);
    if (!connectionFailed) {
      status.innerText = "⚪ Peer disconnected";
    }
  });

  channel.addEventListener("open", () => {
    console.log(`${channel.label} established`);
  });
}


function onReceiveTextCallback(ev) {
  const data = JSON.parse(ev.data);
  const div = document.createElement('div');
  div.className = 'message received';
  div.innerHTML = `
    ${linkify(data.text)}
    <div class="timestamp">${getCurrentTime()}</div>
  `;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}


function onReceiveFileCallback(ev) {
  // file meta info
  if (typeof(ev.data) === "string") {
    const data = JSON.parse(ev.data);
    receivedFile = data.file;

    fileMessageDiv = document.createElement('div');
    fileMessageDiv.className = 'received file-message';

    createProgress0(fileMessageDiv);
    chatBox.appendChild(fileMessageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    return
  }

  // console.log(`Received bytes ${ev.data.byteLength}`);
  receiveBuffer.push(ev.data);
  receivedSize += ev.data.byteLength;
  fileMessageDiv.querySelector('.progress-fill').style.width = `${receivedSize / receivedFile.filesize * 100}%`;

  if (receivedSize === receivedFile.filesize) {
    console.log("received complete file")
    const received = new Blob(receiveBuffer);
    
    createProgress100(fileMessageDiv, receivedFile.filename, receivedFile.filesize, URL.createObjectURL(received));

    chatBox.scrollTop = chatBox.scrollHeight;

    receivedFile = "";
    receiveBuffer = [];
    receivedSize = 0;
  }
}


function closeDataChannels(){
  if (pc) {
    pc.close();
  }
  pc = null;
  receivedFile = "";
  receiveBuffer = [];
  receivedSize = 0;
  sendBtn.disabled = true;
}


function sendData(){
  // send text
  let text = textInput.value;

  if (text.trim() != '') {
    const div = document.createElement('div');
    div.className = 'message sent';
    div.innerHTML = `
      ${linkify(text)}
      <div class="timestamp">${getCurrentTime()}</div>
    `;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;

    textDataChannel.send(JSON.stringify({
      type: "text",
      timestamp: "",
      text: text
    }));
  }


  // send file
  const file = fileInput.files[0];
  fileInput.value = ''
  fileName.textContent = 'No file';
  if (!file || file.size === 0) {
    return;
  }
  
  console.log(`File is`, file);

  fileDataChannel.send(JSON.stringify({
    type: "file",
    timestamp: "",
    file: {
      filename: file.name,
      filesize: file.size,
      mimetype: file.type
    }
  }));
  
  fileMessageDiv = document.createElement('div');
  fileMessageDiv.className = 'sent file-message';
  createProgress0(fileMessageDiv);
  chatBox.appendChild(fileMessageDiv);
  chatBox.scrollTop = chatBox.scrollHeight;

  const chunkSize = 16 * 1024;
  fileReader = new FileReader();
  let offset = 0;
  fileReader.addEventListener('error', error => console.error('Error reading file:', error));
  fileReader.addEventListener('abort', ev => console.log('File reading aborted:', ev));
  fileReader.addEventListener('load', ev => {
    fileDataChannel.send(ev.target.result);
    offset += ev.target.result.byteLength;
    // console.log('send slice ', offset);
    
    if (offset < file.size) {
      readSlice(offset);
      fileMessageDiv.querySelector('.progress-fill').style.width = `${offset / file.size * 100}%`;
    } else {
      createProgress100(fileMessageDiv, file.name, file.size, "#");
      chatBox.scrollTop = chatBox.scrollHeight;
      console.log("done")
    }
  });

  const readSlice = o => {
    const slice = file.slice(offset, o + chunkSize);
    fileReader.readAsArrayBuffer(slice);
  };

  readSlice(0);
}


function createProgress0(node){
  node.innerHTML = `
    <div class="file-message-icon">🗎</div>
    <div class="progress-bar">
      <div class="progress-fill" style="width:0%"></div>
    </div>
  `;
}


function createProgress100(node, filename, filesize, downloadUrl){
  const progressBar = node.querySelector('.progress-bar');
  if (progressBar) {
    progressBar.remove();
  }
  
  node.innerHTML = `
    <div class="file-message-icon">🗎</div>
    <div class="file-message-details">
      <a href="${downloadUrl}" download="${filename}">${filename}</a>
      <span class="filesize">${formatFileSize(filesize)}</span>
    </div>
    <div class="timestamp">${getCurrentTime()}</div>
  `;
}
