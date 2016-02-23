/**
 * Handles curent semester and date handling
 */

var date = (function() {

	var dateObj = new Date();
	var publicObj = {

		/**
		 * Assumes default semester is fall, and date object exists
		 * @return String containing current semester value
		 */
		getCurrentSemester: function() {

			var semester = 'fall';

			if(dateObj.getMonth() < 6) {
				semester = 'spring';
			} else if(dateObj.getMonth() >= 6 && dateObj.getMonth() < 8) {
				semester = 'summer';
			} else if(dateObj.getMonth() >= 8 && dateObj.getMonth() <= 12 ) {
				semester = 'fall';
			}

			return semester;
		},

		/**
		 * Assumes dateObj exists and is an instance of Date
		 * @return Integer containing full numerical year
		 */
		getCurrentYear: function() {
			return dateObj.getFullYear();
		}
	};

	return publicObj;

})();
	

module.exports = date;