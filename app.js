/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var express = require('express'); // app server
var bodyParser = require('body-parser'); // parser for post requests
var Conversation = require('watson-developer-cloud/conversation/v1'); // watson sdk

var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

// Bootstrap application settings
app.use(express.static(__dirname + '/public')); // load UI from public folder
app.use(bodyParser.json());

// Create the service wrapper
var conversation = new Conversation({
  // If unspecified here, the CONVERSATION_USERNAME and CONVERSATION_PASSWORD env properties will be checked
  // After that, the SDK will fall back to the bluemix-provided VCAP_SERVICES environment property
  // username: '<username>',
  // password: '<password>',
  // url: 'https://gateway.watsonplatform.net/conversation/api',
  version_date: Conversation.VERSION_DATE_2017_04_21
});

// Endpoint to be call from the client side
app.post('/api/message', function(req, res) {
  var workspace = process.env.WORKSPACE_ID || '<workspace-id>';
  if (!workspace || workspace === '<workspace-id>') {
    return res.json({
      'output': {
        'text': 'The app has not been configured with a <b>WORKSPACE_ID</b> environment variable. Please refer to the ' + '<a href="https://github.com/watson-developer-cloud/conversation-simple">README</a> documentation on how to set this variable. <br>' + 'Once a workspace has been defined the intents may be imported from ' + '<a href="https://github.com/watson-developer-cloud/conversation-simple/blob/master/training/car_workspace.json">here</a> in order to get a working application.'
      }
    });
  }
  var payload = {
    workspace_id: workspace,
    context: req.body.context || {},
    input: req.body.input || {}
  };

  // Send the input to the conversation service
  conversation.message(payload, function(err, data) {
    if (err) {
      return res.status(err.code || 500).json(err);
    }
    return res.json(updateMessage(payload, data));
  });
});

/**
 * Updates the response text using the intent confidence
 * @param  {Object} input The request to the Conversation service
 * @param  {Object} response The response from the Conversation service
 * @return {Object}          The response with the updated message
 */
function updateMessage(input, response) {
  var responseText = null;
  if (!response.output) {
    response.output = {};
  } else {
    return response;
  }
  if (response.intents && response.intents[0]) {
    var intent = response.intents[0];
    // Depending on the confidence of the response the app can return different messages.
    // The confidence will vary depending on how well the system is trained. The service will always try to assign
    // a class/intent to the input. If the confidence is low, then it suggests the service is unsure of the
    // user's intent . In these cases it is usually best to return a disambiguation message
    // ('I did not understand your intent, please rephrase your question', etc..)
    if (intent.confidence >= 0.75) {
      responseText = 'I understood your intent was ' + intent.intent;
    } else if (intent.confidence >= 0.5) {
      responseText = 'I think your intent was ' + intent.intent;
    } else {
      responseText = 'I did not understand your intent';
    }
  }
  response.output.text = responseText;
  return response;
}


app.get('/', function(req, res) {
	res.sendfile('index.html');
});

var connectedSockets = {};
var allUsers = [ {
	nickname : "",
	color : "#000"
} ]; //初始值即包含"群聊",用""表示nickname
io.on('connection', function(socket) {


	socket.on('addUser', function(data) { //有新用户进入聊天室
		if (connectedSockets[data.nickname]) { //昵称已被占用
			socket.emit('userAddingResult', {
				result : false
			});
		} else {
			socket.emit('userAddingResult', {
				result : true
			});
			socket.nickname = data.nickname;
			connectedSockets[socket.nickname] = socket; //保存每个socket实例,发私信需要用
			allUsers.push(data);
			socket.broadcast.emit('userAdded', data); //广播欢迎新用户,除新用户外都可看到
			socket.emit('allUser', allUsers); //将所有在线用户发给新用户
		}

	});

	socket.on('addMessage', function(data) { //有用户发送新消息
		if (data.to) { //发给特定用户
			connectedSockets[data.to].emit('messageAdded', data);
		} else { //群发
			data.flag = 'robot';
			data.text = 'gogogo';
			connectedSockets[data.from].emit('messageAdded', data);
		/*            socket.broadcast.emit('messageAdded',data);//广播消息,除原发送者外都可看到
		            data.from = 'Robot Alpha';
		            data.text = 'gogogo';
		            socket.broadcast.emit('messageAdded',data);
		            
		            connectedSockets[data.to].emit('messageAdded',data);*/
		}


	});



	socket.on('disconnect', function() { //有用户退出聊天室
		socket.broadcast.emit('userRemoved', { //广播有用户退出
			nickname : socket.nickname
		});
		for (var i = 0; i < allUsers.length; i++) {
			if (allUsers[i].nickname == socket.nickname) {
				allUsers.splice(i, 1);
			}
		}
		delete connectedSockets[socket.nickname]; //删除对应的socket实例

	}
	);
});

module.exports = http;
