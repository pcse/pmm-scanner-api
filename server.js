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

var client 	= require('dgram').createSocket('udp4');
var http 	= require('http');
var mysql   = require('mysql').createConnection({
	host    : MYSQL_DB_HOST,
	port    : MYSQL_DB_PORT,
	user    : 'adminVhA9aks',
	password: 'WwnDBa9n2sNz',
	database: 'pmm'
});

console.log(process.env);

// establish connection - handle errors if any
mysql.connect(function(error) {

	if(error) {
	    return console.log('ERR', error);
	}

	console.log('MYSQL', 'Successfully connected to the mysql server.');

});

client.bind(8000, APP_MAIN_HOST, function() {
	console.log('SOCKET', 'Successfully bound udp socket.')
});

var httpServer = http.createServer(function() {

}).listen(APP_MAIN_PORT, APP_MAIN_HOST);