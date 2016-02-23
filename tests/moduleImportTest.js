var date = require('../lib/date.js');
var sems = ['spring', 'summer', 'fall'];

var semExists = false;
sems.map(function(value) {
	if(!semExists) semExists = (date.getCurrentSemester() == value);
});

var d = new Date();

console.log('SemesterIsValid =', semExists);
console.log('CurrentFullYearIsValid =', d.getFullYear() == date.getCurrentYear());