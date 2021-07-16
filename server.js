#!/usr/bin/env nodejs

/**
 * Pizza My Mind API server - Handles API endpoint requests
 * Serves online web app requests for viewing event data.
 * @juanvallejo
 */

var os = require('os');

// detect if in production at CNU server
if(os.hostname() == 'fenrir') {
	process.env.OPENSHIFT_MYSQL_DB_USER = 'root';
	process.env.OPENSHIFT_MYSQL_DB_PASS = 'pcse';
	process.env.OPENSHIFT_MYSQL_DB_PORT = '3306';

	process.env.OPENSHIFT_NODEJS_PORT 	= 7777;
} else {
	// TODO(juanvallejo): we'll need to clean up these names to remove any OpenShift references at some point
	process.env.OPENSHIFT_MYSQL_DB_USER = 'root';
	process.env.OPENSHIFT_MYSQL_DB_PASS = 'pcse';
	process.env.OPENSHIFT_MYSQL_DB_PORT = '3306';
}

// define runtime variables
var MYSQL_DB_HOST 	= process.env.OPENSHIFT_MYSQL_DB_HOST 	|| '127.0.0.1';
var MYSQL_DB_PORT 	= process.env.OPENSHIFT_MYSQL_DB_PORT 	|| '3307';
var MYSQL_DB_USER 	= process.env.OPENSHIFT_MYSQL_DB_USER 	|| 'root';
var MYSQL_DB_PASS 	= process.env.OPENSHIFT_MYSQL_DB_PASS 	|| '';

var APP_MAIN_HOST 	= process.env.OPENSHIFT_NODEJS_IP 		|| '0.0.0.0';
var APP_MAIN_PORT 	= process.env.OPENSHIFT_NODEJS_PORT 	|| 7777;

var ERR_NO_MYSQL_CONNECTION 	= "Unable to access the database at this time. Please try again later.";
var ERR_API_INVALID_ENDPOINT 	= "Invalid endpoint. Check your URL and try again. (/api/v1/key/value)";
var ERR_API_MISSING_CONTEXT 	= "A valid context is required. Please edit your request to include (/context/[students|events])";
var ERR_API_DB_ERR 				= "Server error, it's not you, it's me. Please report this to juan.vallejo.12@cnu.edu.";
var ERR_API_UNAUTHORIZED 		= "Request is not authorized to access the API.";
var ERR_API_USER_NOT_ACTIVE 	= "Request is not authorized. API access for this email is not enabled.";
var ERR_FILEIO_404 				= "404. The page you are looking for cannot be found.";

var ERR_CODE_1_SQL_ERR 				= -1;
var ERR_CODE_2_SQL_OUTPUT_NOT_JSON 	= -2;
var ERR_CODE_SQL_DISCONNECTED 		= -3;
var ERR_CODE_API_UNAUTHORIZED 		= -4;
var ERR_CODE_API_USER_NOT_ACTIVE 	= -5;
var ERR_CODE_FILEIO_404 			= -6;

var fs 		= require('fs');
var socket 	= require('socket.io');
var http 	= require('http');
var fcsv 	= require('fast-csv');

var auth 	= require('./private/auth.js');
var date 	= require('./lib/date.js');

var mysql   = require('mysql').createConnection({
	host    : MYSQL_DB_HOST,
	port    : MYSQL_DB_PORT,
	user    : MYSQL_DB_USER,
	password: MYSQL_DB_PASS,
	database: 'pmm'
});

var Hashids = require('hashids');
var emailjs = require('emailjs');

var emailServer = emailjs.server.connect({
	user: 'cnuapps.me@gmail.com',
	password: 'cnuapps2016',
	host: 'smtp.gmail.com',
	tls: true,
	port: 587
});

var requestRouter = {
	'/': 'index.html',
	'/admin' : 'index.html',
	'/clare': 'index.html',
	'/api/register': 'index.html'
};

var requestDefs = {
	'index.html': {
		'type': 'FILE',
		'mime': 'html'
	}
}

var typeDefs = {
	'css' 	: 'text/css' 				,
	'csv'	: 'text/csv'				,
	'html' 	: 'text/html' 				,
	'ico' 	: 'image/x-icon'			,
	'jpg' 	: 'image/jpeg'				,
	'jpeg' 	: 'image/jpeg' 				,
	'js' 	: 'application/javascript' 	,
	'map' 	: 'application/x-navimap'	,
	'pdf' 	: 'application/pdf' 		,
	'png' 	: 'image/png'				,
	'ttf'	: 'application/octet-stream',
	'txt' 	: 'text/plain'				,
	'woff'	: 'application/x-font-woff'
}

// define env variables
var eventName 						= null;
var eventEntryCreated 				= false;
var databaseSynced 					= false;
var databaseConnected 				= false;
var databaseEntries 				= {};
var callbacksOnEventEntryCreated 	= [];

var GLOBAL_DATE_OBJ 				= new Date();
var GLOBAL_DATE 					= (GLOBAL_DATE_OBJ.getMonth() + 1) + '_' + GLOBAL_DATE_OBJ.getDate() + '_' + GLOBAL_DATE_OBJ.getFullYear();

// establish connection - handle errors if any
mysql.connect(function(error) {

	if(error) {
	    console.log('FATAL', 'MYSQL', 'CONNECTION', error);
	    return process.exit(1);
	}

	databaseConnected = true;

	console.log('MYSQL', 'Successfully connected to the mysql server.', 'Setting up database...');
	initFetchDatabaseEntries();

});

var httpServer = http.createServer(function(request, response) {

	var routedReq = requestRouter[request.url] || request.url;

	var extension = routedReq.split('.');
	extension = extension.length ? extension[extension.length - 1] : null;

	// parse client requests
	// assume api request
	if(routedReq.match(/\/api\/v1\/.*/gi)) {

		authenticateAPIRequest(request, response, routedReq, function(err, request, response, routedReq) {
			if(err) {
				return respondWithError(response, ERR_API_UNAUTHORIZED, ERR_CODE_API_UNAUTHORIZED);
			}
			parseAPIV1Request(request, response, routedReq);
		});

	} else if(routedReq.match(/\/api\/.*/gi) && !routedReq.match(/\/api\/register\/.*/gi)) {
		respondWithError(response, ERR_API_INVALID_ENDPOINT);
	} else if(routedReq.match(/\/downloads\/.*/gi)) {

		var file = routedReq.split('/downloads/')[1];

		fs.readFile(__dirname + '/downloads/' + file, function(err, data) {
			
			// file does not exist
			if(err) {
				console.log('SERVER', 'HTTP', '404', err);
				response.writeHead(404);
				return response.end(ERR_FILEIO_404);
			}

			var ext = file.split('.');
			ext = ext[ext.length - 1];

			response.writeHead(200, { 'Content-Type': (typeDefs[ext] || 'text/plain'), 'Content-Disposition': 'attachment; filename=' + file });
			response.end(data);

		});

	} else {

		var pathToFile = routedReq;

		if(routedReq.match(/\/api\/register\/.*/gi)) {
			pathToFile = requestRouter['/api/register'];
		}

		return fs.readFile(__dirname + '/' + pathToFile, function(err, data) {

			if(err) {
				console.log('SERVER', 'HTTP', '404', err);
				return response.end(ERR_FILEIO_404);
			}

			var mime = typeDefs[extension];

			response.writeHead(200, {'Content-Type': mime});
			response.end(data);
		});

	}

}).listen(APP_MAIN_PORT, APP_MAIN_HOST);

/**
 * Checks to see if requets to the API
 */
function authenticateAPIRequest(request, response, routedReq, callback) {

	var authHeader = request.headers.authentication;

	if(!authHeader) {
		if(callback && typeof callback == 'function') {
			return callback.call(this, true, request, response, routedReq);
		}

		return respondWithError(response, ERR_API_UNAUTHORIZED, ERR_CODE_API_UNAUTHORIZED);
	}

	var authHeaderTokens = authHeader.split(';');
	var headerTokens = {};

	if(authHeader && authHeaderTokens.length) {

		for(var i = 0; i < authHeaderTokens.length; i++) {
		
			var keyVal = authHeaderTokens[i].split('=');

			if(keyVal.length) {
				var key = keyVal[0].replace(/\ /gi, '');
				var val = keyVal[1].replace(/\ /gi, '');
				headerTokens[key] = val;
			}

		}

	}

	mysql.query('SELECT propValue, isActive, hashKey FROM `metadata` WHERE property="api_user" AND propValue="' + headerTokens.email + '" AND hashKey="' + headerTokens.key + '" AND isActive="1"', function(err, rows) {

		if(err) {
			return console.log('SERVER', 'API', 'MYSQL', 'AUTH', err);
		}

		var ERR_NOT_AUTH = true;

		if(rows.length && rows[0].propValue && rows[0].hashKey && rows[0].propValue == headerTokens.email && rows[0].hashKey == headerTokens.key) {
			if(!rows[0].isActive) {
				respondWithError(response, ERR_API_USER_NOT_ACTIVE, ERR_CODE_API_USER_NOT_ACTIVE);
			} else {
				ERR_NOT_AUTH = false;
			}
		}

		if(callback && typeof callback == 'function') {
			callback.call(this, ERR_NOT_AUTH, request, response, routedReq);
		}

	});

}

/**
 * Requires a database connection. Will return an error string
 * if there is no MySQL connection established.
 *
 * @param request 	Object HTTP request object, contains data sent by a client
 * @param response	Object HTTP response object, used to respond to client's request
 * @param routedReq String Parsed request URI, contains API endpoint request
 */
function parseAPIV1Request(request, response, routedReq) {

	if(!databaseConnected) {
		return respondWithError(response, ERR_NO_MYSQL_CONNECTION, ERR_CODE_SQL_DISCONNECTED);
	}

	var parsedReq = routedReq.split('/api/v1/');
	var keyValues = parsedReq[1] ? parsedReq[1].split('/') : null;

	if(!parsedReq || !keyValues || keyValues.length < 2) {
		return respondWithError(response, ERR_API_INVALID_ENDPOINT);
	}

	// translations from api key to mysql terms
	var queryRoutes = {
		id: 'student_id',
		eventid: 'event_id',
		eventname: 'event_name',
		gradyear: 'grad_year'
	}

	// default selection
	var keyValuePairs = {

		// global fields
		context: 'events', // database context to select entries from

		// student fields
		student_id: null, // student id
		first: null, // johnny
		last: null, // gray
		grad_year: null,
		major: null,
		email: null,

		// event fields
		event_id: null, // 11_5_2015
		event_name: null, // lockheed martin
		semester: null, // spring, summer, fall
		year: null // 2015

	};

	// parse through key-value pairs
	for(var i = 0; i < keyValues.length; i+=2) {
		keyValuePairs[(queryRoutes[keyValues[i].toLowerCase()] || keyValues[i].toLowerCase())] = keyValues[i + 1];
	}

	// format selection values that may contain spaces or special characters
	if(keyValuePairs.event_name) {
		keyValuePairs.event_name = decodeURIComponent(keyValuePairs.event_name);
	}

	if(keyValuePairs.first) {
		keyValuePairs.first = decodeURIComponent(keyValuePairs.first);
	}

	if(keyValuePairs.last) {
		keyValuePairs.last = decodeURIComponent(keyValuePairs.last);
	}

	if(keyValuePairs.email) {
		keyValuePairs.email = decodeURIComponent(keyValuePairs.email);
	}

	if(keyValuePairs.year) {
		keyValuePairs.year = decodeURIComponent(keyValuePairs.year);
	}

	var mysqlQuery = '';

	// translate parameter keys into mysql column names where needed
	var mysqlRoutes = {
		grad_year: 'year',
		event_id: 'table_name',

	}

	// determine which context the api request wants
	if(keyValuePairs.context == 'students' || keyValuePairs.context == 'events' || keyValuePairs.context == 'general') {

		// returns results from a "student | events | general" context
		if(keyValuePairs.context == 'students') {
			mysqlQuery = "SELECT t1.student_id AS id, t3.first, t3.last, t3.major, t3.year AS gradyear, t3.email, t3.date_added AS since, COUNT(t1.student_id) AS total, COUNT(IF(t1.is_new = 1, 1, NULL)) AS total_new FROM `attendance` AS t1 LEFT JOIN `students` AS t3 ON t1.student_id=t3.student_id LEFT JOIN `events` AS t2 ON t1.event_id=t2.table_name";
		} else if(keyValuePairs.context == 'events') {
			mysqlQuery = "SELECT t1.event_id, t2.event_name, t2.semester, t2.year, COUNT(t1.student_id) AS total, COUNT(IF(t1.is_new = 1, 1, NULL)) AS total_new FROM `attendance` AS t1 LEFT JOIN `students` AS t3 ON t1.student_id=t3.student_id LEFT JOIN `events` AS t2 ON t1.event_id=t2.table_name";
		} else {
			mysqlQuery = "SELECT t1.event_id, t2.event_name, t2.semester, t2.year, t3.student_id AS id, t3.first, t3.last, t3.major, t3.year AS gradyear, t3.email, t3.date_added AS since FROM `attendance` AS t1 LEFT JOIN `students` AS t3 ON t1.student_id=t3.student_id LEFT JOIN `events` AS t2 ON t1.event_id=t2.table_name";
		}

		// valid mysql parameter dictionary
		var mysqlRoutes = {
			student_id: 	't1.student_id="' + keyValuePairs.student_id + '"',
			first: 			't3.first="' + keyValuePairs.first + '"',
			last: 			't3.last="' + keyValuePairs.last + '"',
			grad_year: 		't3.year="' + keyValuePairs.grad_year + '"',
			major: 			't3.major LIKE "%' + keyValuePairs.major + '%"',
			email: 			't3.email="' + keyValuePairs.email + '"',
			event_id: 		't2.table_name="' + keyValuePairs.event_id + '"',
			event_name: 	't2.event_name LIKE "%' + keyValuePairs.event_name + '%"',
			semester: 		't2.semester="' + keyValuePairs.semester + '"',
			year: 			't2.year="' + keyValuePairs.year + '"'
		}

		var atLeastOneKey = false;

		// determines wheter to add AND or WHERE
		// mysql statement depending on the value of
		// atLeastOneKey
		function andWhereConverter() {

			if(atLeastOneKey) {
				mysqlQuery += ' AND ';
			} else {
				mysqlQuery += ' WHERE ';
				atLeastOneKey = true;
			}

		}

		// loop through params and add to mysql query
		for(var key in keyValuePairs) {
			if(keyValuePairs[key] && mysqlRoutes[key]) {
				andWhereConverter();
				mysqlQuery += mysqlRoutes[key];
			}
		}

		if(keyValuePairs.context == 'students') {
			mysqlQuery += " GROUP BY t1.student_id ORDER BY t3.last ASC";
		} else if(keyValuePairs.context == 'events') {
			mysqlQuery += " GROUP BY t1.event_id ORDER BY t2.id ASC";
		}

	} else {
		return respondWithError(response, ERR_API_MISSING_CONTEXT);
	}

	mysql.query(mysqlQuery, function(err, rows) {

		if(err) {
			console.log('MYSQL', 'QUERY', 'ERR', err);
			console.log('MYSQL', 'QUERY', 'DUMP', mysqlQuery);
			return respondWithError(response, ERR_API_DB_ERR, ERR_CODE_1_SQL_ERR);
		}

		try {
			response.end(JSON.stringify(rows));
		} catch(e) {
			respondWithError(response, ERR_API_DB_ERR, ERR_CODE_2_SQL_OUTPUT_NOT_JSON);
		}

	});

}

/**
 * Responds an http request with a specified error
 */
function respondWithError(response, error, errorCode) {

	var errObj = [];
	errObj[0] = {
		error: true,
		message: error,
		code: errorCode
	}

	response.writeHead(500, {'Content-Type': 'application/json'});
	response.end(JSON.stringify(errObj));

}

/**
 * Fetches all saved entries (from table `students`)
 * from database for comparing with registered clients
 * Assumes initConfigureDatabase() has already been called
 */
function initFetchDatabaseEntries() {

	databaseEntries.deleted = {};

	console.log('MYSQL', 'INFO', 'Fetching stored data from database...');

	mysql.query('SELECT * FROM `students`', function(err, rows, fields) {

		if(err) {
			return console.log('MYSQL', err);
		}

		databaseEntries.students = rows;

		mysql.query('SELECT * FROM `attendance` WHERE event_id="' + GLOBAL_DATE + '"', function(attErr, attRows, attFields) {

			if(attErr) {
				return console.log('MYSQL', attErr);
			}

			databaseEntries.attendance = attRows;

			mysql.query('SELECT * FROM `events`', function(evtErr, evtRows, evtFields) {

				if(evtErr) {
					return console.log('MYSQL', evtErr);
				}

				databaseEntries.events = evtRows;
				
				// init socket listener
				initSocketListener();

			});

		});

	});
}

/**
 * Opens socket connection to begin syncing data
 * with clients running PMM software
 * Assumes configureDatabase() has been called
 */
function initSocketListener() {

	console.log('SERVER', 'Database ready, ' + databaseEntries.students.length + ' rows found. Listening for connections on port ' + APP_MAIN_PORT + '...');

	var io = socket.listen(httpServer).on('connection', function(client) {

		console.log('SOCKET', 'CONNECTION', 'Client', client.id, ' has connected');

		// tell client connection has been established
		client.emit('connected', {id: client.id});

		// we receive basic event information to add to
		// `events` mysql table
		client.on('eventmetadata', function(data) {

			// tell console we're creating a table for our event instead of updating the mysql database. hopefully just this once.
			console.log('MYSQL', 'SYNC', client.id, 'Adding new event data from client to `events` table');

			mysql.query('INSERT IGNORE INTO `events` (table_name, event_name, semester, year) VALUES ("' + data.eventId + '", "' + data.eventName + '", "' + data.semester + '", "' + data.year + '")', function(err) {

				if(err) {
					// if an error occurrs creating table for current event, 
					return console.log('MYSQL', 'QUERY', err);
				}

				eventEntryCreated = true;

				// call all onEventEntryCreated callback functions
				for(var i = 0; i < callbacksOnEventEntryCreated.lenght; i++) {
					callbacksOnEventEntryCreated[i].call();
				}

				// reset callbacks
				callbacksOnEventEntryCreated = [];

			});
		});

		// called at beginning of client program. client sends a copy of its local
		// database. it is matched with remote database, remote database is updated accordingly.
		// consists of student rows, event rows, and attendance rows
		client.on('eventdata', function(data) {
			console.log('SERVER', 'SYNC', 'EVENT', 'Syncing database information...');
			syncDatabases(data, client);
		});

		// client sends full attendance data
		client.on('attendancedata', function(data) {
			syncDatabases(data, client);
		});

		// handle command to remove student from attendance for current event
		client.on('cmd_del_student', function(data) {

			for(var i = 0; i < databaseEntries.attendance.length; i++) {
				if(data.studentId == databaseEntries.attendance[i].student_id) {
					// databaseEntries.deleted[data.studentId] = true;
					databaseEntries.attendance.splice(i, 1);
				}
			}
			
			mysql.query('DELETE FROM `attendance` WHERE student_id="' + data.studentId + '" and event_id="' + GLOBAL_DATE + '"', function(err) {
				if(err) {
	 				return console.log('SERVER', 'CLIENT', 'MYSQL', err);
				}
			});

		});

		/**
		 * Handle GUI events
		 */

		// admin has requested a spreadhseet version of the
		// data provided as an array
		client.on('registerapiadmindownloadspreadsheet', function(data) {
			
			var csvStream = fcsv.createWriteStream({ headers: true });
			var stream  = fs.createWriteStream(__dirname + '/downloads/' + data.filename);

			stream.on('finish', function() {
				client.emit('registerapiadmindownloadspreadsheetresponse', { url: '/downloads/' + data.filename });
			});

			csvStream.pipe(stream);

			for(var i = 0; i < data.entries.length; i++) {

				if(data.entries[i].events) {
					data.entries[i].events = data.entries[i].events.length;
				}

				csvStream.write(data.entries[i]);
			}

			csvStream.end();

		});

		// admin has requested data for a specific student
		client.on('registerapiadminstudentdata', function(data) {
			// first, grab specific student information
			mysql.query('SELECT student_id,last,first,year,major,email FROM `students` WHERE student_id="' + data.id + '"', function(err, rows) {
				var studentData = {};

				if (!err && rows.length && data.id != "") {
					studentData = {
						first: rows[0].first,
						last: rows[0].last,
						year: rows[0].year,
						major: rows[0].major,
						email: rows[0].email
					};
				}

				mysql.query('SELECT t1.table_name AS event_id,t1.event_name,t1.semester,t1.year,t3.student_id AS id,t3.first,\
			 		t3.last,t3.major,t3.year AS gradyear,t3.email,t3.date_added AS since,t4.crn,IFNULL(t5.question_id, NULL) \
			 		AS survey,t6.course AS crncourse,t6.title AS crntitle,t6.instructor AS crninstructor FROM `events` AS t1 \
			 		LEFT JOIN `attendance` AS t2 ON t1.table_name=t2.event_id AND t2.student_id="' + data.id + '" LEFT \
			 		JOIN `students` AS t3 ON t2.student_id=t3.student_id LEFT JOIN `chosencourses` AS t4 ON t2.student_id=t4.student_id \
			 		AND t4.semester="' + date.getCurrentSemester() + '" AND t4.year="' + date.getCurrentYear() + '" LEFT JOIN \
			 		`surveyresponses` AS t5 ON t2.student_id=t5.student_id AND t5.semester="' + date.getCurrentSemester() + '" \
			 		AND t5.year="' + date.getCurrentYear() + '" LEFT JOIN `coursedata` AS t6 ON t4.crn=t6.crn AND \
			 		t6.semester="' + date.getCurrentSemester() + '" AND t6.year="' + date.getCurrentYear() + '" WHERE \
			 		t1.semester="' + date.getCurrentSemester() + '" AND t1.year="' + date.getCurrentYear() + '" \
			 		GROUP BY t1.id', function(err, rows) {

			 			if(err) {

							client.emit('registerapiadminstudentdataresponse', {
			 					entries: [],
			 					student_data: studentData,
			 					error: true,
			 					message: err.toString()
			 				});

	 						return console.log('SERVER', 'CLIENT', 'MYSQL', err);
						}

						client.emit('registerapiadminstudentdataresponse', {
							student_id: data.id,
			 				student_data: studentData,
			 				entries: rows
			 			});

			 		});
			});

		});

		// admin has requested survey and extra credit data
		client.on('registerapiadminsurveydata', function() {

			mysql.query('SELECT t1.student_id,t4.last AS student_last,t4.first AS student_first,t4.major AS \
				student_major,t4.email AS student_email,t2.question_id,t2.question,t3.choice,t3.choice_id,t1.text_response,t2.type FROM \
				`surveyresponses` AS t1 LEFT JOIN `surveyquestions` AS t2 ON t1.question_id=t2.question_id \
				LEFT JOIN `surveyquestionchoices` AS t3 ON t1.choice_id=t3.choice_id LEFT JOIN `students` \
				AS t4 ON t1.student_id=t4.student_id WHERE t1.semester="' + date.getCurrentSemester() + '" \
				AND t1.year="' + date.getCurrentYear() +'"', function(err, rows) {

				if(err) {

					client.emit('registerapiadminsurveydataresponse', {
		 				entries: [],
		 				error: true,
		 				message: err.toString()
		 			});

 					return console.log('SERVER', 'CLIENT', 'MYSQL', err);
				}

				// fetch extra credit and append it to survey data response
				mysql.query('SELECT t1.crn, t3.course, t3.section, t3.instructor, t1.student_id, t2.last, \
					t2.first, t2.year, t2.email FROM `chosencourses` AS t1 INNER JOIN `students` AS t2 \
					ON t1.student_id=t2.student_id AND t1.semester="' + date.getCurrentSemester() + '" \
					AND t1.year="' + date.getCurrentYear() + '" LEFT JOIN `coursedata` AS t3 ON \
					t1.crn=t3.crn AND t3.semester="' + date.getCurrentSemester() + '" AND \
					t3.year="' + date.getCurrentYear() +'"', function(ecErr, ecRows) {

					if(ecErr) {

						client.emit('registerapiadminsurveydataresponse', {
			 				entries: [],
			 				error: true,
			 				message: ecErr.toString()
			 			});

	 					return console.log('SERVER', 'CLIENT', 'MYSQL', err);

					}

						
					client.emit('registerapiadminsurveydataresponse', {
		 				entries: rows,
		 				ecEntries: ecRows
		 			});

				});

			});

		});

		// admin has requested authentication
		client.on('registerapiauthadmin', function(clientData) {

		 	if(!clientData.email || !clientData.hash) {
		 		client.emit('registerapiauthadminresponse', {
		 			entries: [],
		 			error: true,
		 			message: err.toString()
		 		});
 				return console.log('SERVER', 'CLIENT', 'MYSQL', err);
		 	}

		 	// authenticate admin; determine if any rows exist with
		 	// email and hashkey provided
		 	mysql.query('SELECT * FROM `metadata` WHERE propValue="' + clientData.email + '" AND hashKey="' + clientData.hash + '"', function(mErr, rows) {

		 		if(mErr) {
		 			client.emit('registerapiauthadminresponse', {
			 			entries: [],
			 			error: true,
			 			authenticated: false,
			 			message: mErr.toString()
			 		});
	 				return console.log('SERVER', 'CLIENT', 'MYSQL', mErr);
		 		}

		 		if(!rows.length) {
		 			console.log('ADMIN LOGIN', 'WARNING', clientData.email, 'has failed to log in with keycode', clientData.hash);
		 			return client.emit('registerapiauthadminresponse', {
			 			entries: [],
			 			authenticated: false,
			 			error: true,
			 			message: ERR_API_UNAUTHORIZED
			 		});
		 		}

		 		console.log('ADMIN LOGIN', 'WARNING', clientData.email, 'has successfully logged in with keycode', clientData.hash);

		 		// use api to select general context of students to events
		 		// also merge in courses selected
		 		mysql.query('SELECT t1.event_id, t2.event_name, t2.semester, t2.year, t3.student_id AS id, \
		 			t3.first, t3.last, t3.major, t3.year AS gradyear, t3.email, t3.date_added AS since, \
		 			t4.crn FROM `attendance` AS t1 INNER JOIN `events` AS t2 ON t1.event_id=t2.table_name \
		 			AND t2.semester="' + date.getCurrentSemester() + '" AND t2.year="' + date.getCurrentYear() + '" \
		 			LEFT JOIN `students` AS t3 ON t1.student_id=t3.student_id LEFT JOIN `chosencourses` AS \
		 			t4 ON t1.student_id=t4.student_id AND t4.semester="' + date.getCurrentSemester() + '" \
		 			AND t4.year="' + date.getCurrentYear() + '" ORDER BY t3.last ASC', function(err, rows) {
		 				
	 				if(err) {

	 					console.log('SERVER', 'CLIENT', 'API', 'HTTP', err);

		 				return client.emit('registerapiauthadminresponse', {
		 					entries: [],
				 			authenticated: false,
				 			error: true,
				 			message: err
		 				});

	 				}

	 				client.emit('registerapiauthadminresponse', {
	 					entries: rows,
	 					authenticated: true
	 				});

	 			});

		 	});

		 });

		// handle client requesting update of student CRN
		// expects data to contain a student ID
		client.on('registerapistudentcrn', function(data) {
			mysql.query('SELECT t1.student_id, t1.semester, t1.year FROM `chosencourses` AS t1 WHERE \
				t1.student_id="' + data.id + '" AND t1.semester="' + date.getCurrentSemester() + '" \
				AND t1.year="' + date.getCurrentYear() + '"', function(err, rows) {
				
				if(err) {
					client.emit('registerapistudentcrnresponse', {
			 			updated: false,
			 			crn: null,
			 			error: true,
			 			message: err.toString()
			 		});
	 				return console.log('SERVER', 'CLIENT', 'MYSQL', 'SELECT->courseCRNDuplicateVerify', err);
				}

				if(rows.length) {
					mysql.query('UPDATE `chosencourses` SET crn="' + data.crn + '" WHERE student_id="' + data.id + '" \
						AND semester="' + date.getCurrentSemester() + '" AND year="' + date.getCurrentYear() + '"', onCrnHandle);
				} else {
					mysql.query('INSERT INTO `chosencourses` (crn, student_id, semester, year) VALUES ("' + data.crn + '", \
						"' + data.id + '", "' + date.getCurrentSemester() + '", "' + date.getCurrentYear() + '")', onCrnHandle);
				}

				function onCrnHandle(err) {
					if(err) {
						client.emit('registerapistudentcrnresponse', {
				 			updated: false,
				 			crn: null,
				 			error: true,
				 			message: err.toString()
				 		});
		 				return console.log('SERVER', 'CLIENT', 'MYSQL', 'UPDATE->courseCRN', err);
					}

					mysql.query('SELECT t1.crn, t1.course AS crncourse, t1.title AS crntitle, t1.instructor \
						AS crninstructor FROM `coursedata` AS t1 WHERE t1.crn="' + data.crn + '" AND \
						t1.semester="' + date.getCurrentSemester() +'" AND t1.year="' + date.getCurrentYear() + '"', function(err, rows) {

						if(err) {
							console.log('SERVER', 'CLIENT', 'MYSQL', 'SELECT->courseCRN', err);
						}

						client.emit('registerapistudentcrnresponse', {
			 				updated: true,
			 				crn: data.crn,
			 				crndata: (rows.length ? rows[0] : null)

			 			});
					});
				}
			
			});
		});
		 
		 // handle request for database last update timestamp
		 // expects no data from client
		 client.on('registerapistudentidlastupdated', function() {

		 	mysql.query('SELECT propValue AS timestamp FROM `metadata` WHERE property="last_updated"', function(err, rows) {
		 		
		 		if(err) {
		 			client.emit('registerapistudentidlastupdatedresponse', {
			 			timestamp: null,
			 			error: true,
			 			message: err.toString()
			 		});
	 				return console.log('SERVER', 'CLIENT', 'MYSQL', err);
		 		}

		 		client.emit('registerapistudentidlastupdatedresponse', {
 					timestamp: rows[0].timestamp
 				});

		 	});

		 });

		// handle student registration, fetch event data, survey data, crn data
		client.on('registerapistudentid', function(clientData) {

		 	if(clientData.context == 'students') {
		 		return mysql.query('SELECT * FROM `students` WHERE student_id = "' + clientData.id + '"', function(err, rows) {
		 			if(err) {
		 				client.emit('registerapistudentidresponse', {
				 			entries: [],
				 			error: true,
				 			message: err.toString()
				 		});
		 				return console.log('SERVER', 'CLIENT', 'MYSQL', err);
		 			}

		 			client.emit('registerapistudentidresponse', {
	 					entries: rows,
	 					id: clientData.id,
	 					context: clientData.context
	 				});

		 		});
		 	}

		 	// to speed things up, ignore api, use direct mysql query.
		 	// if we made it here, assume student has attended events before.
		 	// fetch all events for a single semester
		 	mysql.query('SELECT t1.table_name AS event_id,t1.event_name,t1.semester,t1.year,t3.student_id AS id,t3.first,\
		 		t3.last,t3.major,t3.year AS gradyear,t3.email,t3.date_added AS since,t4.crn,IFNULL(t5.question_id, NULL) \
		 		AS survey,t6.course AS crncourse,t6.title AS crntitle,t6.instructor AS crninstructor FROM `events` AS t1 \
		 		LEFT JOIN `attendance` AS t2 ON t1.table_name=t2.event_id AND t2.student_id="' + clientData.id + '" LEFT \
		 		JOIN `students` AS t3 ON t2.student_id=t3.student_id LEFT JOIN `chosencourses` AS t4 ON t2.student_id=t4.student_id \
		 		AND t4.semester="' + date.getCurrentSemester() + '" AND t4.year="' + date.getCurrentYear() + '" LEFT JOIN \
		 		`surveyresponses` AS t5 ON t2.student_id=t5.student_id AND t5.semester="' + date.getCurrentSemester() + '" \
		 		AND t5.year="' + date.getCurrentYear() + '" LEFT JOIN `coursedata` AS t6 ON t4.crn=t6.crn AND \
		 		t6.semester="' + date.getCurrentSemester() + '" AND t6.year="' + date.getCurrentYear() + '" WHERE \
		 		t1.semester="' + date.getCurrentSemester() + '" AND t1.year="' + date.getCurrentYear() + '" \
		 		GROUP BY t1.id', function(err, rows) {

		 		if(err) {

		 			client.emit('registerapistudentidresponse', {
			 			entries: [],
			 			error: true,
			 			message: err.toString()
			 		});

		 			return console.log('SERVER', 'CLIENT', 'MYSQL', err);
		 		}

		 		client.emit('registerapistudentidresponse', {
 					entries: rows,
 					id: clientData.id,
 					context: clientData.context
 				});

		 	});		 	

		});

		// handle student survey questions request
		// expects student id
		client.on('registerapistudentidsurvey', function(clientData) {

		 	// fetch survey questions
		 	mysql.query('SELECT t1.question_id,t1.question,t2.choice,t1.type,t2.choice_id FROM `surveyquestions` AS t1 LEFT JOIN `surveyquestionchoices` \
		 	AS t2 ON t1.question_id=t2.question_id ORDER BY t1.question_id ASC', function(err, rows) {

		 		if(err) {

		 			client.emit('registerapistudentidsurveyresponse', {
			 			entries: [],
			 			error: true,
			 			message: err.toString()
			 		});

		 			return console.log('SERVER', 'CLIENT', 'MYSQL', err);
		 		}

		 		client.emit('registerapistudentidsurveyresponse', {
 					entries: rows,
 					id: clientData.id
 				});

		 	});

		});

		// client has submitted survey answers
		client.on('registerapistudentsurveysubmit', function(clientData) {

			// survey question type definitions
			// they must match client definitions
			var SURVEY_QUESTION_MULT_CHOICE = 1;
			var SURVEY_QUESTION_FREE_RESP 	= 2;

			mysql.query('SELECT student_id, semester, year FROM `chosencourses` WHERE \
				student_id="' + clientData.student_id + '" AND semester="' + date.getCurrentSemester() + '" \
				AND year="' + date.getCurrentYear() + '"', function(err, rows) {

				mysql.query('SELECT * FROM `coursedata` WHERE crn="' + clientData.crn + '"', instructorQueryDone);
				function instructorQueryDone(err, rows){

					console.log("logging row: " + rows[0]);
					var instructor = rows[0].instructor	;

					if(rows.length) {
						mysql.query('UPDATE `chosencourses` SET crn="' + clientData.crn + '", instructor = "' + instructor + '" WHERE \
							student_id="' + clientData.student_id + '" AND semester="' + date.getCurrentSemester() + '" \
							AND year="' + date.getCurrentYear() + '"', onCrnHandle);
					} else {

						mysql.query('INSERT INTO `chosencourses` (crn, student_id, semester, year) \
							VALUES ("' + clientData.crn + '", "' + clientData.student_id + '", \
								"' + date.getCurrentSemester() + '", "' + date.getCurrentYear() + '", "' + instructor + '")', onCrnHandle);
					}
				}

				function onCrnHandle(err) {
					if(err) return console.log('SERVER', 'CLIENT', 'MYSQL', 'UPDATE->courseCRN', err);
				}

			});

			// save all responses
			for(var i = 0; i < clientData.entries.length; i++) {

				if(clientData.entries[i].type == SURVEY_QUESTION_MULT_CHOICE) {
					mysql.query('INSERT INTO `surveyresponses` (student_id, question_id, choice_id, semester, year) \
						VALUES("' + clientData.student_id + '", "' + clientData.entries[i].question_id + '", \
							"' + clientData.entries[i].choice_id + '", "' + date.getCurrentSemester() + '", \
							"' + date.getCurrentYear() + '")', mysqlQueryCallback);
				} else {
					mysql.query('INSERT INTO `surveyresponses` (student_id, question_id, text_response, semester, year) \
						VALUES("' + clientData.student_id + '", "' + clientData.entries[i].question_id + '", \
							"' + clientData.entries[i].response_text + '", "' + date.getCurrentSemester() + '", \
							"' + date.getCurrentYear() + '")', mysqlQueryCallback);
				}

			}

			var errors = [];
			var resultsCount = 0;

			function mysqlQueryCallback(err) {

				resultsCount++;

				if(err) {
		 			console.log('SERVER', 'API', 'SURVEY', err);
					errors.push(err);
				}

				if(resultsCount == clientData.entries.length) {

					if(errors.length) {
						return client.emit('registerapistudentsurveysubmitresponse', {
			 				error: true,
			 				message: errors[0],
			 				student_id: clientData.student_id,
			 			});
					}

					client.emit('registerapistudentsurveysubmitresponse', {
	 					student_id: clientData.student_id
	 				});

				}

			}

		});

		 // handle email registration
		 client.on('registerapiemail', function(data) {
		 	
		 	mysql.query('SELECT propValue AS email, isActive, hashKey FROM `metadata` WHERE property="api_user" AND propValue="' + data.email + '"', function(err, rows) {

		 		if(err) {
		 			client.emit('registerapiemailresponse', {
		 				error: true,
		 				unauthorized: false,
		 				email: data.email,
		 				entry: null
		 			});
		 			return console.log('SERVER', 'API', 'REGISTER', err);
		 		}

		 		if(!rows.length) {
		 			return client.emit('registerapiemailresponse', {
		 				error: true,
		 				unauthorized: true,
		 				email: data.email,
		 				entry: null
		 			});
		 		}

		 		// generate new hash key
		 		var hash = new Hashids(data.email);
		 		hash = hash.encode(Date.now());

		 		// if entry isActive, email out existing hashKey
		 		if(rows[0].isActive) {

		 			hash = rows[0].hashKey;

		 			client.emit('registerapiemailresponse', {
		 				entry: rows[0]
		 			});

		 			console.log('SERVER', 'API', 'REGISTER', 'Failed to register entry with email', data.email, '. Entry already registered.');

		 			var emailText = 'Thank you for requesting access to the Pizza My Mind API\n';
			 		emailText += 'You are receiving this email as a reminder of your Pizza My Mind API key.\n\n';
			 		emailText += 'Please take note of the API key below, you will need it';
			 		emailText += ' in order to authenticate requests with the API server.\n\n';
			 		emailText += 'Your API key is "' + hash + '"\n\n';
			 		emailText += 'For instructions on how to use this key to request data from the API, please consult';
			 		emailText += ' the Pizza My Mind API Server documentation: https://github.com/juanvallejo/pcse-scanner-api/blob/master/README.md\n\n';
			 		emailText += 'Juan';

		 		} else {

		 			var emailText = 'You are receiving this email because you requested access to the Pizza My Mind API';
			 		emailText += ' and your email address is eligible for access. Please take note of the API key below, you will need it';
			 		emailText += ' in order to authenticate requests with the API server.\n\n';
			 		emailText += 'Your API key is "' + hash + '"\n\n';
			 		emailText += 'For instructions on how to use this key to request data from the API, please consult';
			 		emailText += ' the Pizza My Mind API Server documentation: https://github.com/juanvallejo/pcse-scanner-api/blob/master/README.md\n\n';
			 		emailText += 'Juan';

		 		}

		 		// if entry is not active, create new hash, update database to have it,
		 		// set entry as active in the database, and email out the hashKey
		 		// if we got this far, assume what was jsut typed is true
		 		emailServer.send({
		 			text: emailText,
		 			from: 'Pizza My Mind API <cnuapps.me@gmail.com>',
		 			to: data.email,
		 			subject: 'CNU Pizza My Mind API Request'
		 		}, function(err, message) {

		 			if(err) {
		 				client.emit('registerapiemailresponse', {
			 				error: true,
			 				unauthorized: false,
			 				email: data.email,
			 				entry: null
			 			});
		 				return console.log('SERVER', 'API', 'REGISTER', 'EMAIL', err);
		 			}

		 			console.log('SERVER', 'API', 'REGISTER', 'Email sent to', data.email, 'with API key', hash);

		 			mysql.query('UPDATE `metadata` SET isActive="1", hashKey="' + hash + '" WHERE property="api_user" AND propValue="' + data.email +'"', function(err) {
		 				if(err) {
		 					return console.log('SERVER', 'API', 'REGISTER', 'ERROR', err);
		 				}

		 				console.log('SERVER', 'API', 'REGISTER', 'UPDATE->hashKey', hash);
		 			});

		 			client.emit('registerapiemailresponse', {
		 				entry: rows[0],
		 				newHash: hash
		 			});

		 		});

		 	});
		 });

		/**
		 * Received when a student registers with the client
		 */
		client.on('disconnect', function(data) {
			console.log('SERVER', 'DISCONNECT', 'Client', client.id, 'has disconnected.');
		});

	});
}

/**
 * Makes a request to the public API
 * and returns values from server
 */
function requestUsingAPI(endpoint, callback) {

	var ERROR_OCCURRED = false;

	var request = http.request({
 		host: 'fenrir.pcs.cnu.edu',
 		port: '7777',
 		path: endpoint,
 		method: 'GET',
 		headers: {
 			'Authentication': 'email=' + auth.email + '; key=' + auth.key
 		}

 	}, function(response) {

 		var data = '';

 		response.on('data', function(chunk) {
 			data += chunk;
 		});

 		response.on('end', function() {
 			if(typeof callback == 'function') {
 				callback.call(this, ERROR_OCCURRED, data);
 			}
 		});

 	});

 	request.end();

 	request.on('error', function(err) {

 		ERROR_OCCURRED = err;

 		if(typeof callback == 'function') {
 			callback.call(this, ERROR_OCCURRED);
 		}
 	});
}

/**
 * Takes an array of objects, compares entries passed
 * with current entries. Algorithm always prefers passed entries
 * as most recent. Cloud entries WILL be updated with client entries
 */
function syncDatabases(clientEntries, client) {

	var _time = Date.now();
	var entriesSynced = 0;
	var errors = [];

	// sync event names
	if(clientEntries.eventname) {
		if(eventName == null || clientEntries.eventname != eventName) {
			eventName = clientEntries.eventname;
			console.log('SERVER', 'SYNC', 'eventName', 'Found updated event name, altering...');
			mysql.query("UPDATE `events` SET event_name='" + eventName + "' WHERE table_name='" + GLOBAL_DATE + "'", function(err) {
				if(err) {
					return console.log('SERVER', 'SYNC', 'eventName', 'ERR', err);
				}
					console.log('SERVER', 'SYNC', 'eventName', 'Successfully updated eventName to', eventName);
			});
		}
	}

	if(clientEntries.students) {

		console.log('SERVER', 'SYNC', 'Comparing remote `students`', databaseEntries.students.length , ':', clientEntries.students.length);

		var diff = [];

		for(var i = 0; i < clientEntries.students.length; i++) {
			
			var entryExists = false;

			for(var x = 0; x < databaseEntries.students.length && !entryExists; x++) {
				if(clientEntries.students[i].id == databaseEntries.students[x].student_id) {
					entryExists = true;
				}
			}

			// save entry in diff, databaseEntries.students
			if(!entryExists) {
				diff.push(clientEntries.students[i]);
				databaseEntries.students.push({
					student_id: clientEntries.students[i].id,
					last: clientEntries.students[i].lname,
					first: clientEntries.students[i].fname,
					year: clientEntries.students[i].year,
					major: clientEntries.students[i].major,
					email: clientEntries.students[i].email,
					date_added: GLOBAL_DATE
				});
			}

		}

		if(diff.length) {
			console.log('SERVER', 'SYNC', 'DIFF', 'Found', diff.length, 'student records missing from remote database. Adding...');
			for(var i = 0; i < diff.length; i++) {
				mysql.query('INSERT IGNORE INTO `students` (student_id, last, first, year, major, email, date_added) VALUES ("' + diff[i].id + '", "' + diff[i].lname + '", "' + diff[i].fname + '", "' + diff[i].year + '", "' + diff[i].major + '", "' + diff[i].email + '", "' + GLOBAL_DATE + '")', function(err) {
					if(err) {
						return console.log('SERVER', 'SYNC', 'DIFF', 'ERR', err);
					}

				});

				mysql.query('INSERT IGNORE INTO `students_master` (student_id, last, first, year, major, email, date_added) VALUES ("' + diff[i].id + '", "' + diff[i].lname + '", "' + diff[i].fname + '", "' + diff[i].year + '", "' + diff[i].major + '", "' + diff[i].email + '", "' + GLOBAL_DATE + '")', function(secErr) {
					if(secErr) {
						return console.log('SERVER', 'SYNC', 'DIFF', 'secErr', err);
					}

					console.log('SERVER', 'SYNC', 'DIFF', 'Successfully updated `students` and `students_master` with client data.');
					updateDatabaseTimestamp();

				});
			}
		}

	}

	if(clientEntries.attendance) {

		console.log('SERVER', 'SYNC', 'Comparing remote `attendance`', databaseEntries.attendance.length , ':', clientEntries.attendance.length);

		var diff = [];

		for(var i = 0; i < clientEntries.attendance.length; i++) {
			
			var entryExists = false;

			for(var x = 0; x < databaseEntries.attendance.length && !entryExists; x++) {
				if(clientEntries.attendance[i].student_id == databaseEntries.attendance[x].student_id && clientEntries.attendance[i].event_id == databaseEntries.attendance[x].event_id) {
					entryExists = true;
				}
			}

			// save entry in diff, databaseEntries.attendance
			if(!entryExists && !databaseEntries.deleted[clientEntries.attendance[i].student_id]) {
				diff.push(clientEntries.attendance[i]);
				databaseEntries.attendance.push(clientEntries.attendance[i]);
			}

		}

		if(diff.length) {
			console.log('SERVER', 'SYNC', 'DIFF', 'Found', diff.length, 'attendance records missing from remote database. Adding...');
			for(var i = 0; i < diff.length; i++) {
				mysql.query('INSERT INTO `attendance` (student_id, event_id, is_new) VALUES ("' + diff[i].student_id + '", "' + diff[i].event_id + '", "' + diff[i].is_new + '")', function(err) {
					if(err) {
						return console.log('SERVER', 'SYNC', 'DIFF', 'ERR', err);
					}

					console.log('SERVER', 'SYNC', 'DIFF', 'Successfully updated `attendance` with client data.');
					updateDatabaseTimestamp();

				});
			}
		}
	}

	if(clientEntries.events) {

		console.log('SERVER', 'SYNC', 'Comparing remote `events`', databaseEntries.events.length , 'with', clientEntries.events.length);

		var diff = [];

		for(var i = 0; i < clientEntries.events.length; i++) {
			
			var entryExists = false;

			for(var x = 0; x < databaseEntries.events.length && !entryExists; x++) {
				if(clientEntries.events[i].table_name == databaseEntries.events[x].table_name) {
					entryExists = true;
				}
			}

			if(!entryExists) {
				diff.push(clientEntries.events[i]);
				databaseEntries.events.push(clientEntries.events[i]);
			}

		}

		if(diff.length) {
			console.log('SERVER', 'SYNC', 'DIFF', 'Found', diff.length, 'event records missing from remote database. Adding...');
			for(var i = 0; i < diff.length; i++) {
				mysql.query('INSERT IGNORE INTO `events` (table_name, event_name, semester, year) VALUES ("' + diff[i].table_name + '", "' + diff[i].event_name + '", "' + diff[i].semester + '", "' + diff[i].year + '")', function(err) {
					if(err) {
						return console.log('SERVER', 'SYNC', 'DIFF', 'ERR', err);
					}

					console.log('SERVER', 'SYNC', 'DIFF', 'Successfully updated `events` with client data.');
					updateDatabaseTimestamp();

				});
			}
		}
	}

	// if present, update global date
	if(clientEntries.global_date) {
		console.log('SERVER', 'SYNC', 'DATE', 'Syncing global date to ' + clientEntries.global_date);
		GLOBAL_DATE = clientEntries.global_date;
	}

	// if present, compare with hash of attendance table and determine if there are any differences
	// this differs from attendance above, as this is the FULL attendance table, not just the entries
	// for the current event
	if(clientEntries.attendanceHash) {

		console.log('SERVER', 'SYNC', 'HASH', 'Comparing: Length =', clientEntries.attendanceHash.total, '; Hash = ', clientEntries.attendanceHash.md5);

		mysql.query('SELECT MD5(concat(student_id, event_id, is_new, COUNT(*))) AS md5, COUNT(*) AS total FROM `attendance` ORDER BY student_id DESC', function(err, rows) {

			if(err) {
				return console.log('API', 'SYNC', 'ERR', err);
			}

			

			if(rows[0].total == clientEntries.attendanceHash.total && rows[0].md5 == clientEntries.attendanceHash.md5) {
				return console.log('SERVER', 'SYNC', 'HASH', 'Comaring: Length =', rows[0].total, '; Hash = ', rows[0].md5);
			}

			console.log('SERVER', 'SYNC', 'HASH', 'Attendance data mismatch, requesting updated dataset from client.');
			client.emit('requestattendancedata');

		});
	}

	// differs from attendance above as this syncs FULL attendance data
	// not just attendance data for the current event
	if(clientEntries.attendanceData) {

		if(!databaseEntries.attendanceFull) {
			databaseEntries.attendanceFull = [];
		}

		console.log('SERVER', 'SYNC', 'ATTENDANCEDATA', 'Received full attendance data from client', client.id);
		mysql.query('SELECT * FROM `attendance`', function(err, rows) {

			if(err) {
				return console.log('SERVER', 'SYNC', 'ATTENDANCE', 'ERR', err);
			}

			var diff = [];

			for(var i = 0; i < clientEntries.attendanceData.length; i++) {
				
				var entryExists = false;

				for(var x = 0; x < rows.length && !entryExists; x++) {
					if(clientEntries.attendanceData[i].student_id == rows[x].student_id && clientEntries.attendanceData[i].event_id == rows[x].event_id) {
						entryExists = true;
					}
				}

				if(!entryExists) {
					diff.push(clientEntries.attendanceData[i]);

					// determine if entry exists in databaseEntries.attendance
					var exists = false;
					for(var y = 0; y < databaseEntries.attendance.length; y++) {
						if(databaseEntries.attendance[y].student_id == clientEntries.attendanceData[i].student_id && databaseEntries.attendance[y].event_id == clientEntries.attendanceData[i].event_id) {
							exists = true;
						}
					}

					// only push to local database attendance entries if
					// the missing entry matches the current event's date
					if(clientEntries.attendanceData[i].event_id == GLOBAL_DATE && exists) {
						databaseEntries.attendance.push(clientEntries.attendanceData[i]);
						databaseEntries.attendanceFull.push(clientEntries.attendanceData[i]);
					}
				}

			}

			if(diff.length) {
				console.log('SERVER', 'SYNC', 'DIFF', 'Found', diff.length, 'FULL attendance records missing from remote database. Adding...');
				for(var i = 0; i < diff.length; i++) {
					mysql.query('INSERT INTO `attendance` (student_id, event_id, is_new) VALUES ("' + diff[i].student_id + '", "' + diff[i].event_id + '", "' + diff[i].is_new + '")', function(err) {
						if(err) {
							return console.log('SERVER', 'SYNC', 'DIFF', 'ERR', err);
						}

						console.log('SERVER', 'SYNC', 'DIFF', 'Successfully updated `attendance` with client data.');
						updateDatabaseTimestamp();

					});
				}
			}			

		});
	}
	
}

function updateDatabaseTimestamp() {

	mysql.query('UPDATE `metadata` SET propValue="' + Date.now() + '" WHERE property="last_updated"', function(err) {
		if(err) {
			return console.log('MYSQL', 'TIMESTAMP', 'ERR', err);
		}

		console.log('MYSQL', 'UPDATE', 'Updated database timestamp.');

	});

}
