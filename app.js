var express = require("express");
var bodyParser = require("body-parser");
var request = require("request");
var mongodb = require('mongodb');
var functionSheet = require('./functionSheet');
var cron = require('cron');
var api = require('./apiCalls')
var async = require('async');
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN

// var apiai = require('apiai');
// var nlpapp = apiai("3d2a930932f6409e90ce7cddbe99c3fc");

var app = express();
var ObjectID = mongodb.ObjectID;

app.use(bodyParser.json());

var db;
var config = require('./Schema/config');

app.set('port', (process.env.PORT || 5000));

//시작하기 버튼
request({
  uri: 'https://graph.facebook.com/v2.6/me/messenger_profile',
  qs: { access_token: PAGE_ACCESS_TOKEN },
  method: 'POST',
  json: {
    "get_started":{
      "payload":"<GET_STARTED_PAYLOAD>"
    }
  }
}, function (error, response, body) {
  if (!error && response.statusCode == 200) {
    var recipientId = body.recipient_id;
    var messageId = body.message_id;
  } else {
    console.error("Unable to send message.");
    console.error(response);
    console.error(error);
  }
});

// Connect to webhook
app.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === 'ZoavjtmQjel17ai') {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
});

// Post Messages
app.post('/webhook', function (req, res) {
  var data = req.body;
  // Make sure this is a page subscription
  if (data.object === 'page') {

    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach(function(entry) {
      var pageID = entry.id;
      var timeOfEvent = entry.time;

      // Iterate over each messaging event
      entry.messaging.forEach(function(event) {
        var senderID = event.sender.id;
        db.collection('users').findOne({"fbuid": senderID}, function(err, user){
          if (user) {
            var task = [
              function (callback) {
                var execute;
                callback(null, (functionSheet[event.message.text]));
              },
              function (execute, callback) {
                execute(event, db);
                callback(null);
              }];
            async.waterfall(task);
          }
          else{
            receivedPostback(event);
          }
        });

      });
    });
    // Assume all went well.
    res.sendStatus(200);
  }
});

// "시작하기" 버튼 처리 - 유저 등록
function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  var payload = event.postback.payload;

  if (payload == "<GET_STARTED_PAYLOAD>") {
    request({
      url: "https://graph.facebook.com/v2.6/" + senderID,
      qs: {
        access_token: process.env.PAGE_ACCESS_TOKEN,
        locale: "ko_KR",
        fields: "first_name,last_name,gender"
      },
      method: "GET"
    }, function(error, response, body) {
      if (error) {
        console.log("Error getting user's name: " +  error);
      } else {
        var task = [
          function (callback) {
            var bodyObj = JSON.parse(body);
            var first_name = bodyObj.first_name;
            var last_name = bodyObj.last_name;
            var gender = bodyObj.gender;
            // database
            // db.collection('users').findOne({"fbuid": senderID}, function (err, user){
            //   if (user){
            //     db.collection('users').update({"fbuid": senderID}, {$set: {"first_name": first_name, "last_name": last_name, "gender": gender}})
            //   }
            //   else {
            //     db.collection('users').insertOne({"fbuid": senderID, "first_name": first_name, "last_name": last_name, "gender": gender})
            //   }
            // });
            callback(null, first_name)
          },
          function (first_name, callback) {
            api.sendResponse(event, {"text":"안녕 " + first_name + "!"});
            api.sendResponse(event, {"text": "난 너의 캠퍼스 생활을 도와줄 설대봇이야!"});
        }];
        async.waterfall(task);
      }
    });
    }
    else {
      // db.collection('users').update({"fbuid": senderID}, {$set: {"messagePriority": payload}})
    }
}

app.listen(app.get('port'), function () {
    console.log('Node app is running on port', app.get('port'));
});
