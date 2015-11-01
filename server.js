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
var APP_MAIN_PORT 	= process.env.OPENSHIFT_NODEJS_PORT 	|| 8000;
var APP_UDP_PORT 	= 8080;

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

// establish connection - handle errors if any
mysql.connect(function(error) {

	if(error) {
	    return console.log('ERR', error);
	}

	console.log('MYSQL', 'Successfully connected to the mysql server.');

});

var httpServer = http.createServer(function(request, response) {

	var routedReq = requestRouter[request.url] || request.url;

	if(requestDefs[routedReq] && requestDefs[routedReq].type == 'FILE') {
		fs.readFile(__dirname + '/' + routedReq, function(err, data) {
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

}).listen(APP_MAIN_PORT, APP_MAIN_HOST);

var io = socket.listen(httpServer);

io.on('connection', function(client) {
	console.log('SOCKET.IO', 'Client', client.id, ' has connected');
});

io.on('error', function(err) {
	console.log('SOCKET.IO', err);
});