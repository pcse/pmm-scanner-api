Setting Up Deployment Workflow
==============================

How do we actually make changes to - and deploy this thing to prod?

## Setting up local environment:

Open this project up in your favorite IDE or text editor. Make changes, and push them using a new branch.
Open a Pull Request from that branch against `master`.

Have someone review and approve your PR. Once it's merged, please cleanup your remote branch.

## Deploying to production:

We'll assume your local git environment looks like this:

```
$ git remote -v
origin  git@github.com:pcse/pmm-scanner-api.git (fetch)
origin  git@github.com:pcse/pmm-scanner-api.git (push)
```

We'll add another `remote` ref. This will point to the git repo hosted in `Fenrir` (the production machine running this at CNU).
*Pushing to this new remote ref will automatically update the live-running code in Fenrir and automatically restart the server so that new changes take effect immediately. This all happens automatically, nothing additional to setup or do on your end.*

**Please note that Fenrir can only be accessed from within the PCSE subnet, therefore, pushing to prod will naturally require that you can reach Fenrir from within this subnet** 

```
$ git remote add fenrir ssh://juan@fenrir.pcs.cnu.edu:/home/juan/pcse-scanner-api
```

Your git remotes should now look like this:

```
$ git remote -v
origin  git@github.com:pcse/pmm-scanner-api.git (fetch)
origin  git@github.com:pcse/pmm-scanner-api.git (push)
fenrir  ssh://juan@fenrir:/home/juan/pcse-scanner-api (fetch
fenrir  ssh://juan@fenrir:/home/juan/pcse-scanner-api (push)
```

In order to push to prod without worrying about a password / credentials, simply add your public SSH key to the `~/.ssh/authorized_keys` file in Fenrir.
Refer to the admin documentation to know how to access Fenrir via SSH, or ask the system administrator for more information.
**Make sure to append your key, rather replacing all existing file contents with a new one.**

## Deploying

Once we're all setup with the steps above, deploying new code to production is as easy as:

```
$ git push fenrir master
```

Below is a suggested development workflow:

1. Deploy new changes to the GitHub repo in a new branch. Have your Pull Request reviewed, tested, and merged.

```
# origin == github repo 
$ git push origin my_new_branch
```

2. Once your Pull Request is merged onto the master branch in the GitHub repo, update your local environment:

```
$ git checkout master
$ git reset --hard origin/master
```

3. Make sure the master branch now contains all changes recently merged upstream:

```
$ git log
```

4. Deploy to production

```
$ git push fenrir master
```

API Documentation
===============

###Table of Contents

- **Introduction**
	- API endpoint and format
- **Authentication**
- **Contexts**
	- Contexts - students
		- Using parameters to search
	- Contexts - events
		- Event identifiers
		- Events by semester / year
			- Supported semester parameter values
	- Contexts - general
- **Parameters**
- **Notes**

###Introduction

Using the API consists of a standard **GET** request to a dedicated endpoint that handles client requests specific to the API. This endpoint is shown below. Any request made to the API should begin with the following format:

```
http://fenrir.pcs.cnu.edu/api/v1/
```

An API request is formatted with slashes, requesting data in the form of "key-value" pairs. Only keys that are supported by the current API version may be used. An example is shown below:

```
/id/00555555
```

The request above, would return all stored *event* data for a student with a student ID of *00555555*. Below is an example of the above request showing the full format, including the API endpoint:

```
http://fenrir.pcs.cnu.edu/api/v1/id/0055555
```

###Authentication

In order to obtain results from the database, you must have an **API Key** and an authorized *CNU email*  account.

To verify that your email account has been authorized, and  obtain a key, simply visit the following site, and type your email:

```
http://fenrir.pcs.cnu.edu/api/register
```

Upon verifying your email, an email will be sent to that same account containing your new **API Key**. Should you misplace or forget this *key*, simply visit the same *URL* and type your email. The same *key* will be emailed to you again.

To authenticate requests with the obtained *key*, simply include a *header* in your request with the key of *Authentication* and two segments in the *value*, one named `email` containing your *authorized email address*, and another named `key` containing your unique *key*. An example using *cURL* is shown below:

```sh
curl http://fenrir.pcs.cnu.edu/api/v1/context/students/last/heddle --header "Authentication: email=firstName.lastName@cnu.edu; key=MY_API_KEY"
```

Try the example above in your console using your *email*, *key*, and a student's last name. It should return at least one result.

**Unauthorized requests** Requests that use an invalid email address or key will return a response similar to the one below:

```
[{"error":true,"message":"Request is not authorized to access the API.","code":-4}]
```

**Invalid requests** It is important to check a query for incorrect parameters. The API server will *ignore* any *wrong* or *unknown* URL parameters. This means that a request that is *mostly* valid, but has a few *parameters* misspelled or that are nonexistent will query results *as if those parameters had not been there*. The example below demonstrates this:

```
http://fenrir.pcs.cnu.edu/api/v1/context/students/incorrectParameter/juan/last/lastName
```

The result for the *URL* above will *ignore* the parameter with value *incorrectParameter* and return all student records where the *last name* matches *lastName*.

###Contexts

API consists of three different `contexts`. Contexts can be thought of as modes for your data output.

There are three different types of **contexts**

- `students`
- `events`
- `general`

A **students** context returns a set of data with one or more items in a *many students to one event* relationship. Data is based on students, meaning that output will consist solely of student information. For example, a request with this context with parameters consisting of a *last name* of *Smith* and an *event name* of *Dominion Power* will yield *n* amount of results, where *n* is the number of students with a *last name* of *Smith* that happened to attend an event hosted by *Dominion Power*. An example of this request is shown below:

```
http://fenrir.pcs.cnu.edu/api/v1/context/students/last/smith/eventname/dominion
```

An **events** context returns a set of data with one or more items in a *many events to one student* relationship. Output is based on event information, meaning that a request with this context, containing parameters consisting of  a *student major* in *Computer Science* and a *last name* of *Smith* will return a list of events where students with a last name of *Smith* and a major in *Computer Science* attended. An example of this request is shown below:

```
http://fenrir.pcs.cnu.edu/api/v1/context/events/last/smith/major/computer
```

A **general** context is a bit different from the previously discussed ones. The main difference with a *general* context is that data is returned in a *many to many* relationship between *events* and *students*. A *general* context does not group data sets by unique identifiers (student ID, event ID, etc). This means that a data set returned may have several items with the same event information for each student that attended it, or several  items with the same student information for every event that the particular student attended. This context returns all of the fields that both an *events* context and a *students* context would return. The example below queries for all events attended by every students in the database:

```
http://fenrir.pcs.cnu.edu/api/v1/context/general
```

By default, an **events** context is assumed with every request, if no context is specified in a *URL* request. 

**Parameters** All documented parameters are fully supported any *context*. Please see this section for detailed description of each URL parameter supported.

**Please note** that the order in which any key-value pairs are specified does not matter. A request such as:

```
/context/students/major/philosophy/year/2016
```

would be equally valid if specified as:

```
/year/2016/major/philosophy/context/students
```

####Contexts - students

**Response** The server will return a response with a mime type of *text/plain*. The response format, however, will be an array of objects in [**JSON** format](http://www.json.org/).

```JSON
[{
"id": "00555555",
"last": "LastName",
"first": "FirstName",
"gradyear": "2019",
"major": "Underwater Basket Weaving",
"email": "FirstName.LastName@cnu.edu",
"since": "8_25_2014",
"total": 9,
"total_new": 1
}]
```

**Response Fields**

These are fields (or keys) found in each item returned:

- **email** 		A student's CNU email
- **first** 			A student's first name
- **gradyear** 	A student's graduating year
- **id** 			A student's CNU ID
- **last** 			A student's last name
- **major** 		A student's current major
- **since** 		Date when student was added to database
- **total** 		Total # of events student has attended
- **total_new** 	Total # of events where student had to register (ideally this number would always be 1 if database integrity had persisted since it was created)

**Search** A student *ID* is not required to fetch student records, however, it is the most direct way of obtaining a particular student's data. To search records based on a student's first or last name, simply specify those values as part of the request:

```
http://fenrir.pcs.cnu.edu/api/v1/context/students/first/aaron/last/koehl
```

The example above would return all student records matching  a first name of Aaron" and a last name of "Koehl". If no records are found, an empty array (in **JSON** format) is returned.

####Contexts - events

**Response** The server will return a response with mime type *text/plain*. The response format, however, will be an *array* of objects in [**JSON** format](http://www.json.org/).

```JSON
[{
"event_id": "11_5_2015",
"event_name": "Dominion Power",
"semester": "Fall",
"year": "2015",
"total": "126",
"total_new": "3"
}]
```

**Response Fields**

These are fields (or keys) found in each item returned:

- **event_id** 		An event's identifier
- **event_name** 	Name of host company for this event
- **semester** 		Semester in which this event occurred
- **year** 			Year in which this event occurred
- **total** 			Total # of students at this event
- **total_new** 		Total # of students not previously in the database at this event

**Identifiers** Events have a unique identifier, or ID, based on the exact date in which they occurred. They are in the form of **month**\_**day**\_**fullYear**. An example is shown below for an event having occurred on the *25th of December, 2014*:

```
12_25_2014
```

Below is an example of an API request for an event with a specific name. *Note* that when an event *name* is specified and not its *ID*, the API tries to guess the specific event, if more than one event entry is matched, all entries are returned:
 
```
http://fenrir.pcs.cnu.edu/api/v1/context/events/eventname/lockheed%20martin
```

If, however, an *ID* or an *ID* **and** an event *name* are specified,  the single event matched is still returned in an array:

```
http://fenrir.pcs.cnu.edu/api/v1/context/events/eventname/lockheed%20martin/eventid/10_1_2015
```

The above example would yield the result below:

```JSON
[{"event_id":"10_1_2015","event_name":"Lockheed Martin","semester":"fall","year":"2015","total":135,"total_new":7}]
```

Note that you can expand your query even further by specifying an event year, and semester in which it occurred. This is useful if you are searching for an event in particular but do not know its name or identifier:

```
http://fenrir.pcs.cnu.edu/api/v1/context/events/semester/fall/year/2015
```

**Supported semester values** are:

- fall
- spring
- summer

A *fall* event covers the months from *August* until *December*.

A *spring* event covers the months from *January* until *May*.

And a *summer* event covers the months *June* and *July*.

####Contexts - general

**Response** The server will return a response with mime type *text/plain*. The response format, however, will be an *array* of objects in [**JSON** format](http://www.json.org/).

```JSON
[{
"event_id": "10_1_2015",
"event_name":"Lockheed Martin",
"semester":"fall",
"year":"2015",
"id":"00555555",
"first":"firstName",
"last":"lastName",
"major":"Computer Science",
"gradyear": 2016,
"email":"firstName.lastName@cnu.edu",
"since":"8_25_15"
}]
```

These are fields (or keys) found in each item returned:

- **email** 			A student's CNU email
- **first** 				A student's first name
- **gradyear** 		A student's graduating year
- **id** 				A student's CNU ID
- **last** 				A student's last name
- **major** 			A student's current major
- **since** 			Date when student was added to database
- **event_id** 		An event's identifier
- **event_name** 	Name of host company for this event
- **semester** 		Semester in which this event occurred
- **year** 			Year in which this event occurred

**Relationship** Because this context is a *many to many* relationship between *events* and *students*, every response will contain fields from both an *events* context and *student* context. Responses may contain objects sharing exact information for events, or students, or both, depending on the type of parameters passed. Below is an example of a request for all events where students with the last name *Anderson* attended:

```
http://fenrir.pcs.cnu.edu/api/v1/context/general/last/anderson
```

Both event data and student data will repeat across multiple items returned, as more than one student with a last name of *Anderson* attended more than one event.

###Parameters

URL parameters are *not case sensitive* and can be mixed and matched in any order. Below is a breakdown of each one. *Note* that context does not matter for the type of parameters you can use:

**Supported API URL parameters** are listed below:

- **email** 			A student's CNU email
- **first** 			A student's first name
- **gradyear** 		A student's graduation year
- **id** 				A student's CNU ID
- **last** 				A student's last name
- **major** 			A student's major (Estimated)

- **eventid** 		An event's unique identifier
- **eventname** 	Name of event / host company (Estimated)
- **semester** 		Semester an event occurred
- **year** 			Year an event occurred

**Note** (Estimated) fields mean that their value can be an ambiguous string. Because of this, entries most closely matching the value entered will be returned. This means either part of the value or all of the value may be specified.

**To simply obtain all event or student data** Simply specify the desired *context* with no extra filter parameters. An example requesting all event records is shown below:

```
http://fenrir.pcs.cnu.edu/api/v1/context/events
```

*Simply* replace *events* with *students* for a similar result with all student records.

###Notes

This API is a work in progress, and as such, not all data pertaining to the Pizza My Mind database will be available from the start. Instead, data from years prior to the use of a database for registering students at events will be added over time and record accuracy checked in chunks as this project matures. Please be advised about the following temporary limitations:

- Individual student records will only available from the Fall semester of the year 2014, until the present (API records are updated in real time when the updated scanner client is used at upcoming events).
- Attendance records for any event will only be available starting from the Fall semester of the year 2015.
- Individual event records will only be available starting from the Fall semester of the year 2015.

The limitations above will decrease (data sets expanded) as more data from previous years and semesters is parsed and added to the database.

If you have any questions, or wish to leave any feedback, [please email me](mailto:juan.vallejo.12@cnu.edu).