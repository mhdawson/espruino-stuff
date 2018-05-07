const mqtt = require('MQTT');
const wifi = require('Wifi');

const devicePrefix = 'house/esp1';
const mqttServer = '10.1.1.186';
const keepAliveInterval = 60;

// set up the mqtt connection. Use getSerial to make
// sure the mqtt client id is unique
var options = {
  client_id: getSerial(),
  keep_alive: keepAliveInterval
};
const client = mqtt.create(mqttServer, options);

client.on('connected', function () {
  console.log('MQTT client connected');
  try {
    client.subscribe(devicePrefix + '/led');
    client.subscribe(devicePrefix + '/power');
    client.subscribe(devicePrefix + '/query_state');
  } catch (err) {}
});

client.on('disconnected', function() {
  setTimeout(function() {
    try {
      if (client.connected() !== true) {
        console.log('mqtt reconnecting');
        client.connect();
      }
    } catch (err) {}
  }, 10000);
});

client.on('error', function(err) {
  console.log('mqtt err' + err);
  setTimeout(function() {
    try {
      client.connect();
    } catch (err) {}
  }, 1000);
});

// liveness check, interval must be greater than 
// keepAliveInterval
let live = false;
setInterval(() => {
  if (live === false) {
    // some kind of connection failure either MQTT server
    // is down or a communications failure, try resetting
    // connectivity
    wifi.disconnect();
    doConnect();
  } else {
    live = false;
  }
}, (keepAliveInterval + 30) * 1000);

client.on('ping_reply', ()=> {
  live = true;
});

//  setup control of power and led pins
const powerPin = new Pin(D12);
const ledPin = new Pin(D13);
let powerState = 0;
let ledState = 0;
let flashTimer;

const clearLedFlashTimer = function() {
  if (flashTimer !== undefined) {
    clearInterval(flashTimer);
    flashTimer = undefined;
  }
};

const startFlashTimer = function(time) {
  if (flashTimer !== undefined) {
    clearLedFlashTimer();
  }
  ledState = (ledState + 1) %2;
  flashTimer = setInterval(function() {
    ledState = (ledState + 1) %2;
    digitalWrite(ledPin, (ledState + 1) % 2);
  }, time);
};

client.on('publish', function(message) {
  console.log(message);
  if (message.topic === (devicePrefix + '/power')) {
    if (message.message === 'on') {
      powerState = 1;
    } else if (message.message === 'off') {
      powerState = 0;
    }
    digitalWrite(powerPin, powerState);
    console.log('Power state:' + powerState);
  } else if (message.topic === (devicePrefix + '/led')) {
    clearLedFlashTimer();
    if (message.message === 'on') {
      ledState = 1;
    } else if (message.message === 'off') {
      ledState = 0;
    } else if (message.message.substr(0, 'flash'.length) === 'flash') {
      try {
        timeout = message.message.split(':')[1];
        startFlashTimer(timeout);
      } catch (err) {
        console.log(err);
      }
    }
    digitalWrite(ledPin, (ledState + 1) % 2);
    console.log('Led state:' + ledState);
  } else if (message.topic === (devicePrefix + '/query_state')) {
    try {
      client.publish(devicePrefix + '/state/power', powerState);
      client.publish(devicePrefix + '/state/led', ledState);
    } catch (err) {}
  }
});

const buttonPin = new Pin(D0);
let buttonState = 1;
setInterval(function() {
  let newState = digitalRead(buttonPin);
  if (newState !== buttonState) {
    buttonState = newState;
    try {
      client.publish(devicePrefix + '/button', newState);
    } catch (err) {}

    if (buttonState === 0) {
      powerState = (powerState + 1) %2;
      digitalWrite(powerPin, powerState);
    }
  }
}, 200);

const doConnect = function() {
  // ensure we are connected to wifi
  console.log('Trying to connect');
  wifi.connect('xxxxxxxxxxx', { password: 'xxxxxxxxx'}, function(err) {
    if (err) {
      console.log('Failed to connect');
      console.log(err);
    }
  });
};

wifi.on('connected', function(details) {
  // ok lets start accepting requests
  try {
    client.connect();
  } catch (err) {
    console.log('mqtt failed to connect');
    console.log(err);
  }
  console.log('WIFI connected' + details.toString());
});

wifi.on('disconnected', function() {
  try {
    client.disconnect();
  } catch (err) {}
  console.log('WIFI disconnected');
  doConnect();
});

doConnect();
