
'use strict';

const chatBox = document.querySelector(".chat-messages");
const sendBtn = document.getElementById("send");
const textInput = document.getElementById("textInput");
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const status = document.getElementById("status");

fileInput.onchange = (ev) => {
  const input = ev.target;
  const filename = input.files.length > 0 ? input.files[0].name : "No file";
  fileName.textContent = filename;
}

textInput.oninput = () => {
  textInput.style.height = "auto";
  textInput.style.height = (textInput.scrollHeight) + "px";
}

textInput.onkeydown = (ev) => {
 if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    sendBtn.click();
  }
}

sendBtn.onclick = () => {
  sendData();
}


let fileMessageDiv;
let receivedFile;
let receiveBuffer = [];
let receivedSize = 0;

let pc;
let fileDataChannel;
let textDataChannel;
let fileReader;

let wsPort = ":12345";
let host = window.location.hostname + wsPort;
let httpAddr = "http://" + host;
let wsAddr = "ws://" + host + "/ws";

const ws = new WebSocket(wsAddr);

ws.onmessage = ev => {
  let data = JSON.parse(ev.data)
  console.log(data)
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

ws.onerror = (ev) => {
  console.error('WebSocket error:', ev);
  status.innerText = "WebSocket error"
}

function createPeerConnection(){
  try{
    pc = new RTCPeerConnection();
  }catch(error){
    status.innerText = error
    // window.alert("Please enable webrtc");
  }

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
  });

  fileDataChannel.addEventListener("message", (ev) => {
    onReceiveFileCallback(ev);
  });

  fileDataChannel.addEventListener("close", () => {
    closeDataChannels();
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
    // All candidates have been sent
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
  });
}


function onReceiveTextCallback(ev) {
  const data = JSON.parse(ev.data);
  const div = document.createElement('div');
  div.className = 'message received';
  div.innerHTML = linkify(data.text);
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}


function onReceiveFileCallback(ev) {
  if (typeof(ev.data) === "string") {
    const data = JSON.parse(ev.data);
    receivedFile = data.file;

    fileMessageDiv = document.createElement('div');
    fileMessageDiv.className = 'message received file-message';

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
}


function sendData(){
  // send text
  let text = textInput.value;
  textInput.value = "";
  if (text.trim() != '') {
    const div = document.createElement('div');
    div.className = 'message sent';
    div.innerHTML = linkify(text);
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
  fileMessageDiv.className = 'message sent file-message';
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
      console.log("done")
    }
  });

  const readSlice = o => {
    const slice = file.slice(offset, o + chunkSize);
    fileReader.readAsArrayBuffer(slice);
  };

  readSlice(0);
}


function formatFileSize(bytes) {
  if (bytes >= 1_073_741_824) {
    return (bytes / 1_073_741_824).toFixed(1) + ' GB';
  } else if (bytes >= 1_048_576) {
    return (bytes / 1_048_576).toFixed(1) + ' MB';
  } else if (bytes >= 1024) {
    return (bytes / 1024).toFixed(1) + ' KB';
  } else {
    return bytes + ' Bytes';
  }
}


function linkify(text) {
  const urlPattern = /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:[^\s]*)/gi;
  return text.replace(urlPattern, function(url) {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}


function createProgress0(node){
  const iconDiv = document.createElement('div');
  iconDiv.className = 'file-message-icon';
  iconDiv.textContent = '📎';

  const progressBarDiv = document.createElement('div');
  progressBarDiv.className = 'progress-bar';

  const progressFillDiv = document.createElement('div');
  progressFillDiv.className = 'progress-fill';
  progressFillDiv.style.width = '0%';

  progressBarDiv.appendChild(progressFillDiv);
  node.appendChild(iconDiv);
  node.appendChild(progressBarDiv);
}


function createProgress100(node, filename, filesize, downloadUrl){
  const progressBar = node.querySelector('.progress-bar');
  if (progressBar) {
    progressBar.remove();
  }

  const detailsDiv = document.createElement('div');
  detailsDiv.className = 'file-message-details';

  const fileLink = document.createElement('a');
  fileLink.href = downloadUrl;
  fileLink.download = filename;
  fileLink.textContent = filename;

  const fileSizeSpan = document.createElement('span');
  fileSizeSpan.className = 'filesize';
  fileSizeSpan.textContent = formatFileSize(filesize);

  detailsDiv.appendChild(fileLink);
  detailsDiv.appendChild(fileSizeSpan);
  node.appendChild(detailsDiv);
}