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
var APP_UDP_PORT 	= 7777;

var socket 	= require('socket.io');
var client 	= require('dgram').createSocket('udp4');
var http 	= require('http');
var mysql   = require('mysql').createConnection({
	host    : MYSQL_DB_HOST,
	port    : MYSQL_DB_PORT,
	user    : 'adminVhA9aks',
	password: 'WwnDBa9n2sNz',
	database: 'pmm'
});

// establish connection - handle errors if any
mysql.connect(function(error) {

	if(error) {
	    return console.log('ERR', error);
	}

	console.log('MYSQL', 'Successfully connected to the mysql server.');

});

client.bind(APP_MAIN_PORT, APP_MAIN_HOST, function() {
	console.log('SOCKET', 'Successfully bound udp socket.');
});

client.on('listening', function() {
	console.log('SOCKET', 'Now listening for client connections on port', APP_MAIN_PORT);
});

client.on('close', function() {
	console.log('SOCKET', 'Connection has been closed with client.');
});

client.on('error', function(error) {
	console.log('SOCKET', error);
});

client.on('message', function(message) {
	console.log('SOCCKET', 'MESSAGE', message.toString());
});

var io = socket.listen(APP_UDP_PORT);

io.on('connection', function(client) {
	console.log('SOCKET.IO', 'Client', client.id, ' has connected');
});

io.on('error', function(err) {
	console.log('SOCKET.IO', err);
});

var httpServer = http.createServer(function(request, response) {
	response.end('work in progress');
}).listen(APP_MAIN_PORT, APP_MAIN_HOST);