var express = require('express');
var path = require('path');
require('dotenv').config();
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const cors = require('cors');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var gameRouter = require('./routes/game');

var app = express();

const allowedOrigins = [
    'https://blindtest-party.netlify.app',
    'https://main--blindtest-party.netlify.app',
    'http://localhost:3001'
  ];
  
  app.use(cors({
    origin: function(origin, callback) {
      // Allow requests with no origin like mobile apps or curl
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = 'The CORS policy for this site does not allow access from the specified origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true, // If you need to include cookies in requests
  }));

// app.use(cors({
//     origin: process.env.FRONTEND_URL, // Remplacez par l'origine de votre front-end
//     methods: ['GET', 'POST'],
//     allowedHeaders: ['Content-Type', 'Authorization']
// }));

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/game', gameRouter);

module.exports = app;
