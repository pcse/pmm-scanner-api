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
	    return console.log('MYSQL', error);
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
		return;
	}

	response.end("v1");

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
			syncDatabases(data);
		});

		/**
		 * Received when a student registers with the client
		 */
		client.on('studentregister', function(data) {

		});

	});
}

/**
 * Takes an array of objects, compares entries passed
 * with current entries. Algorithm always prefers passed entries
 * as most recent. Cloud entries WILL be updated with client entries
 */
function syncDatabases(clientEntries) {

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
	
}

function updateDatabaseTimestamp() {

	mysql.query('UPDATE `metadata` SET propValue="' + Date.now() + '" WHERE property="last_updated"', function(err) {
		if(err) {
			return console.log('MYSQL', 'TIMESTAMP', 'ERR', err);
		}

		console.log('MYSQL', 'UPDATE', 'Updated database timestamp.');

	});

}