#!/bin/env/node

/**
 * Pizza My Mind API server - Handles endpoint requests,
 * request authentication, and dataflow
 * @juanvallejo
 */

// define runtime variables
var MYSQL_DB_HOST 	= process.env.OPENSHIFT_MYSQL_DB_HOST 	|| '127.0.0.1';
var MYSQL_DB_PORT 	= process.env.OPENSHIFT_MYSQL_DB_PORT 	|| '63966';
var APP_MAIN_HOST 	= process.env.OPENSHIFT_NODEJS_IP 		|| '0.0.0.0';
var APP_MAIN_PORT 	= process.env.OPENSHIFT_NODEJS_PORT 	|| 7777;

var ERR_NO_MYSQL_CONNECTION 	= "Unable to access the database at this time. Please try again later.";
var ERR_API_INVALID_ENDPOINT 	= "Invalid endpoint. Check your URL and try again. (/api/v1/key/value)";
var ERR_API_MISSING_CONTEXT 	= "A valid context is required. Please edit your request to include (/context/[students|events])";
var ERR_API_DB_ERR 				= "Server error, it's not you, it's me. Please report this to juan.vallejo.12@cnu.edu.";

var ERR_CODE_1_SQL_ERR 				= -1;
var ERR_CODE_2_SQL_OUTPUT_NOT_JSON 	= -2;
var ERR_CODE_SQL_DISCONNECTED 		= -3;

var fs 		= require('fs');
var socket 	= require('socket.io');
var http 	= require('http');
var mysql   = require('mysql').createConnection({
	host    : MYSQL_DB_HOST,
	port    : MYSQL_DB_PORT,
	user    : 'adminVhA9aks',
	password: 'WwnDBa9n2sNz',
	database: 'pmm'
});

var requestRouter = {
	'/': 'index.html'
};

var requestDefs = {
	'index.html': {
		'type': 'FILE',
		'mime': 'html'
	}
}

var typeDefs = {
	'css' 	: 'text/css' 				,
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

	// parse client requests
	if(requestDefs[routedReq] && requestDefs[routedReq].type == 'FILE') {
		return fs.readFile(__dirname + '/' + routedReq, function(err, data) {
			if(err) {
				return console.log('HTTP', 'FS', err);
			}

			var mime = typeDefs[requestDefs[routedReq].mime];
			if(!mime) {
				var ext = routedReq.split('.');
				ext 	= ext[ext.length - 1];
				mime 	= typeDefs[ext] || typeDefs['txt'];
			}

			response.writeHead(200, {'Content-Type': mime});
			response.end(data);
		});
	}

	// assume api request
	if(routedReq.match(/\/api\/v1\/.*/gi)) {
		parseAPIV1Request(request, response, routedReq);
	} else {
		response.end("Invalid endpoint.");
	}

}).listen(APP_MAIN_PORT, APP_MAIN_HOST);


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
		context: 'table',
		eventid: 'event_id',
		eventname: 'event_name',
		gradyear: 'grad_year'
	}

	// default selection
	var keyValuePairs = {

		// global fields
		table: 'events', // database table to select entries from

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

	// determine which context the api request wants
	if(keyValuePairs.table == 'students' || keyValuePairs.table == 'events' || keyValuePairs.table == 'general') {

		// returns results from a "student" context
		if(keyValuePairs.table == 'students') {
			mysqlQuery = "SELECT t1.student_id AS id, t3.first, t3.last, t3.major, t3.email, t3.date_added AS since, COUNT(t1.student_id) AS total, COUNT(IF(t1.is_new = 1, 1, NULL)) AS total_new FROM `attendance` AS t1 LEFT JOIN `students` AS t3 ON t1.student_id=t3.student_id LEFT JOIN `events` AS t2 ON t1.event_id=t2.table_name";
		} else if(keyValuePairs.table == 'events') {
			mysqlQuery = "SELECT t1.event_id, t2.event_name, t2.semester, t2.year, COUNT(t1.student_id) AS total, COUNT(IF(t1.is_new = 1, 1, NULL)) AS total_new FROM `attendance` AS t1 LEFT JOIN `students` AS t3 ON t1.student_id=t3.student_id LEFT JOIN `events` AS t2 ON t1.event_id=t2.table_name";
		} else {
			mysqlQuery = "SELECT t1.event_id, t2.event_name, t2.semester, t2.year, t3.student_id AS id, t3.first, t3.last, t3.major, t3.email, t3.date_added AS since FROM `attendance` AS t1 LEFT JOIN `students` AS t3 ON t1.student_id=t3.student_id LEFT JOIN `events` AS t2 ON t1.event_id=t2.table_name";
		}

		var atLeastOneKey = false;

		// handle student parameters
		if(keyValuePairs.student_id) {
			mysqlQuery += ' WHERE t1.student_id="' + keyValuePairs.student_id + '"';
			atLeastOneKey = true;
		}
			
		if(keyValuePairs.first) {

			if(atLeastOneKey) {
				mysqlQuery += ' AND '
			} else {
				mysqlQuery += ' WHERE '
				atLeastOneKey = true;
			}

			mysqlQuery += 't3.first="' + keyValuePairs.first + '"';
		}

		if(keyValuePairs.last) {

			if(atLeastOneKey) {
				mysqlQuery += ' AND '
			} else {
				mysqlQuery += ' WHERE '
				atLeastOneKey = true;
			}

			mysqlQuery += 't3.last="' + keyValuePairs.last + '"';
		}

		if(keyValuePairs.grad_year) {

			if(atLeastOneKey) {
				mysqlQuery += ' AND '
			} else {
				mysqlQuery += ' WHERE '
				atLeastOneKey = true;
			}

			mysqlQuery += 't3.year="' + keyValuePairs.grad_year + '"';

		}

		if(keyValuePairs.major) {

			if(atLeastOneKey) {
				mysqlQuery += ' AND '
			} else {
				mysqlQuery += ' WHERE '
				atLeastOneKey = true;
			}

			mysqlQuery += 't3.major LIKE "%' + keyValuePairs.major + '%"';

		}

		if(keyValuePairs.email) {

			if(atLeastOneKey) {
				mysqlQuery += ' AND '
			} else {
				mysqlQuery += ' WHERE '
				atLeastOneKey = true;
			}

			mysqlQuery += 't3.email="' + keyValuePairs.email + '"';

		}

		// handle event parameters
		if(keyValuePairs.event_id) {

			if(atLeastOneKey) {
				mysqlQuery += ' AND '
			} else {
				mysqlQuery += ' WHERE '
				atLeastOneKey = true;
			}

			mysqlQuery += 't2.table_name="' + keyValuePairs.event_id + '"';

		}

		if(keyValuePairs.event_name) {

			if(atLeastOneKey) {
				mysqlQuery += ' AND '
			} else {
				mysqlQuery += ' WHERE '
				atLeastOneKey = true;
			}

			mysqlQuery += 't2.event_name LIKE "%' + keyValuePairs.event_name + '%"';

		}

		if(keyValuePairs.semester) {

			if(atLeastOneKey) {
				mysqlQuery += ' AND '
			} else {
				mysqlQuery += ' WHERE '
				atLeastOneKey = true;
			}

			mysqlQuery += 't2.semester="' + keyValuePairs.semester + '"';

		}

		if(keyValuePairs.year) {

			if(atLeastOneKey) {
				mysqlQuery += ' AND '
			} else {
				mysqlQuery += ' WHERE '
				atLeastOneKey = true;
			}

			mysqlQuery += 't2.year="' + keyValuePairs.year + '"';

		}

		if(keyValuePairs.table == 'students') {
			mysqlQuery += " GROUP BY t1.student_id";
		} else if(keyValuePairs.table == 'events') {
			mysqlQuery += " GROUP BY t1.event_id";
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

	var errObj = {
		error: true,
		message: error,
		code: errorCode
	}

	response.writeHead(errorCode || 500);
	response.end(JSON.stringify(errObj));

}

/**
 * Fetches all saved entries (from table `students`)
 * from database for comparing with registered clients
 * Assumes initConfigureDatabase() has already been called
 */
function initFetchDatabaseEntries() {

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

	console.log('SERVER', 'Database configured, ' + databaseEntries.students.length + ' rows found. Listening for connections...');

	var io = socket.listen(httpServer).on('connection', function(client) {

		console.log('SOCKET', 'CONNECTION', 'Client', client.id, ' has connected');

		// tell client connection has been established
		client.emit('connected', {id: client.id});

		// we receive basic event information to add to
		// `events` mysql table
		client.on('eventmetadata', function(data) {

			// tell console we're creating a table for our event instead of updating the mysql database. hopefully just this once.
			console.log('MYSQL', 'SYNC', client.id, 'Adding new event data from client to `events` table');

			mysql.query('INSERT IGNORE INTO `events` (table_name, event_name, semester, year) VALUES ("' + data.eventId + '", "' + data.eventId + '", "' + data.semester + '", "' + data.year + '")', function(err) {

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

		/**
		 * Received when a student registers with the client
		 */
		client.on('disconnect', function(data) {
			console.log('SERVER', 'DISCONNECT', 'Client', client.id, 'has disconnected.');
		});

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
			if(!entryExists) {
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

	// if present, compare with hash of attendance table and determine if there are any differences
	// this differs from attendance above, as this is the FULL attendance table, not just the entries
	// for the current event
	if(clientEntries.attendanceHash) {

		console.log('SERVER', 'SYNC', 'HASH', 'Length =', clientEntries.attendanceHash.total, '; Hash = ', clientEntries.attendanceHash.md5);

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