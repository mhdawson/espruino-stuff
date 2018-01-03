const mqtt = require('MQTT');
const wifi = require('Wifi');

const devicePrefix = 'house/esp1';
const mqttServer = '10.1.1.186';

// ensure we are connected to wifi
wifi.connect('xxxxxxxxxxx', { password: 'xxxxxxxxx'}, function(err) {
  if (err) {
    console.log(err);
  } else {
    console.log('connected');
  }
});

// set up the mqtt connection.  Use getSerial to make
// sure the mqtt client id is unique
var options = {
  client_id: getSerial(),
};
const client = mqtt.create(mqttServer, options);

client.on('connected', function () {
  console.log('connected');
  client.subscribe(devicePrefix + '/led');
  client.subscribe(devicePrefix + '/power');
  client.subscribe(devicePrefix + '/query_state');
});

client.on('disconnected', function() {
  console.log('reconnecting');
  setTimeout(function() {
    client.connect();
  }, 1000);
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
    client.publish(devicePrefix + '/state/power', powerState);
    client.publish(devicePrefix + '/state/led', ledState);
  }
});

// setup reporting of button state
const buttonPin = new Pin(D0);
let buttonState = 0;
setInterval(function() {
  let newState = digitalRead(buttonPin);
  if (newState != buttonState) {
    buttonState = newState;
    client.publish(devicePrefix + '/button', newState);
  }
}, 200);


// ok lets connect and start accepting requests
client.connect();
