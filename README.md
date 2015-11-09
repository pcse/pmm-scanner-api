API Documentation
===============

###Table of Contents

- **Introduction**
	- API endpoint and format
- **Contexts**
	- Contexts - students
		- Using parameters to search
		- Supported student parameters
	- Contexts - events
		- Event identifiers
		- Events by semester / year
			- Supported semester parameters
		- Supported Event parameters
	- Contexts - attendance
- **Notes**

###Introduction

Using the API consists of a standard **GET** request to a dedicated endpoint that handles client requests specific to the API. This endpoint is shown below. Any request made to the API should begin with the following format:

```
http://mind.cnuapps.me/api/v1/
```

An API request is formatted with slashes, requesting data in the form of "key-value" pairs. Only keys that are supported by the current API version may be used. An example is shown below:

```
/id/00555555
```

The request above, would return all stored data for a student with a student ID of *00555555*. Below is an example of the above request showing the full format, including the API endpoint:

```
http://mind.cnuapps.me/api/v1/id/0055555
```

###Contexts

API consists of three different `contexts`. Contexts can be thought of as categories, or modes.

There are three different types of **contexts**

- `students`
- `events`
- `attendance`

By default, the **students** context is chosen, if no context is specified in the *URL*. 

**Parameters** specific to each context will be discussed in subsections that follow. Please **Note** that any parameters specified to a context that are not supported by it will simply be ignored.

**Please note** that the order in which any key-value pairs are specified does not matter. A request such as:

```
/context/students/major/philosophy/year/2016
```

would be equally valid if specified as:

```
/year/2016/major/philosophy/context/students
```

####Contexts - students

**Response** The server will return a response with mime type *text/plain*. The response format, however, will be an array of objects in [**JSON** format](http://www.json.org/).

```JSON
[{
'id': '00555555',
'last': 'LastName',
'first': 'FirstName',
'gradyear': '2019',
'major': 'Underwater Basket Weaving',
'email': 'FirstName.LastName@cnu.edu',
'since': '8_25_2014'
}]
```

**Search** A student *ID* is not required to fetch student records, however, it is the most direct way of obtaining a particular student's data. To search records based on a student's first or last name, simply specify those values as part of the request *instead* of providing a student *ID*:

```
http://mind.cnuapps.me/api/v1/context/students/first/aaron/last/koehl
```

The example above would return all student records matching  a first name of "aaron" and a last name of "koehl". If no records are found, an empty array (in **JSON** format) is returned. *Note* that if you were to provide a student *ID* as part of the above example, the *first* and *last* parameters would be ignored, as an *ID* would always give you a single desired result.

**Supported Student context keywords** are listed below:

- **id** 			A student's CNU ID
- **last** 			A student's last name
- **first** 			A student's first name
- **gradyear** 	A student's graduation year
- **major** 		A student's major (Estimated)
- **email** 		A student's CNU email

**Note** (Estimated) fields mean that their value can be an ambiguous string. Because of this, entries most closely matching the value entered will be returned.

####Contexts - events

**Response** The server will return a response with mime type *text/plain*. The response format, however, will be an *array* of objects in [**JSON** format](http://www.json.org/).

```JSON
[{
'event_id': '11_5_2015',
'event_name': 'Dominion Power',
'semester': 'Fall',
'year': '2015',
'total': '126',
'total_new': '3'
}]
```

**Identifiers** Events have a unique identifier, or ID, based on the exact date in which they occurred. They are in the form of **month**\_**day**\_**fullYear**. An example is shown below for an event having occurred on the *25th of December, 2014*:

```
12_25_2014
```

Below is an example of an API request for an event with a specific name. *Note* that when an event *name* is specified and not its *ID*, the API tries to guess the specific event, if more than one event entry is matched, all entries are returned:
 
```
http://mind.cnuapps.me/api/v1/context/events/eventname/lockheed%20martin
```

If, however, an *ID* or an *ID* **and** an event *name* are specified, only the single event matched is returned:

```
http://mind.cnuapps.me/api/v1/context/events/eventname/lockheed%20martin/eventid/10_1_2015
```

Note that you can expand your query even further by specifying an event year, and semester in which it occurred. This is useful if you are searching for an event in particular but do not know its name or identifier:

```
http://mind.cnuapps.me/api/v1/context/events/semester/fall/year/2015
```

**Supported semesters** are:

- fall
- spring
- summer

A *fall* event covers the months from *August* until *December*.

A *spring* event covers the months from *January* until *May*.

And a *summer* event covers the months *June* and *July*.

**Supported Student context keywords** are listed below:

- **eventid** 			An event's unique identifier
- **eventname** 		Name of event / host company (Estimated)
- **semester** 			Search events by semester
- **year** 				Search events by year

**Note** (Estimated) fields mean that their value can be an ambiguous string. Because of this, entries most closely matching the value entered will be returned.

###Notes

This API is a work in progress, and as such, not all data pertaining to the Pizza My Mind database will be available at once. Instead, data from years prior to the use of a database will be added over time, the database layout will be restructured to ensure flexibility, and record accuracy checked in chunks as this project matures. Please be advised about the following temporary limitations:

- Individual student records will only available from the Fall semester of the year 2014, until the present (API records are updated in real time when the new scanner client is used at upcoming events).
- Attendance records for any event will only be available starting from the Fall semester of the year 2015.
- Individual event records will only be available starting from the Fall semester of the year 2015.

The limitations above will decrease (data sets expanded) as more data from previous years and semesters is parsed and added to the database.

If you have any questions, or wish to leave any feedback, [please email me](mailto:juan.vallejo.12@cnu.edu).