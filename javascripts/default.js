if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(function() {
    console.log('service worker is is all cool.');
  }).catch(function(e) {
    console.error('service worker is not so cool.', e);
    throw e;
  });
}

// bling.js
var $ = window.$ = document.querySelector.bind(document);
var $$ = window.$$ = document.querySelectorAll.bind(document);
Node.prototype.on = window.on = function(name, fn) {
  this.addEventListener(name, fn);
}
NodeList.prototype.__proto__ = Array.prototype;
NodeList.prototype.on = NodeList.prototype.addEventListener = (function(name, fn) {
  this.forEach(function(elem) {
    elem.on(name, fn);
  });
});

// globals. lol.
var opts = {
  amPM: true
};
var whenButtons;
var locationSelects;
var data = {};

(function() {
  'use strict';

  function is_defined(obj) {
    return typeof (obj) !== 'undefined';
  }

  function hasLocalStorage() {
    try {
      localStorage.setItem('test', 'test');
      localStorage.removeItem('test');
      return true;
    } catch (e) {
      return false;
    }
  }

  function saveScheduleSelection() {
    if (!hasLocalStorage()) return;
    localStorage.setItem('caltrain-schedule-from', $('#from select').value);
    localStorage.setItem('caltrain-schedule-to', $('#to select').value);
    if (get_selected_schedule())
      localStorage.setItem('caltrain-schedule-when', get_selected_schedule());
    localStorage.setItem('opts', JSON.stringify(opts));
  }

  function select(elm, val) {
    elm.value = elm.querySelector('option[value="' + val + '"]').value;
  }

  function loadPreviousSettings() {
    if (!hasLocalStorage()) return;
    if (localStorage.getItem('caltrain-schedule-from'))
      select($('#from select'), localStorage.getItem('caltrain-schedule-from'));

    if (localStorage.getItem('caltrain-schedule-to'))
      select($('#to select'), localStorage.getItem('caltrain-schedule-to'));

    if (localStorage.getItem('caltrain-schedule-when')) {
      $$('.when-button').forEach(function(elem) {
        elem.classList.remove('selected');
      });
      var whenButton = $('.when-button[value="' + localStorage.getItem('caltrain-schedule-when') + '"]')
      if (whenButton)
        whenButton.classList.add('selected');
    }

    if (localStorage.getItem('opts'))
      opts = JSON.parse(localStorage.getItem('opts'));
  }

  String.prototype.repeat = function(num) {
    return (num <= 0) ? '' : this + this.repeat(num - 1);
  };

  String.prototype.rjust = function(width, padding) {
    padding = (padding || ' ').substr(0, 1); // one and only one char
    return padding.repeat(width - this.length) + this;
  };

  Object.extend = function(destination, source) {
    for (var property in source) {
      if (source.hasOwnProperty(property)) {
        destination[property] = source[property];
      }
    }
    return destination;
  };

  // now in seconds since the midnight
  function now() {
    var date = new Date();
    return date.getHours() * 60 * 60 +
           date.getMinutes() * 60 +
           date.getSeconds();
  }

  // now date in format YYYYMMDD
  function now_date() {
    return formatDate(new Date());
  }

  // format date to YYYYMMDD
  function formatDate (d) {
    // getMonth starts from 0
    return parseInt([d.getFullYear(), d.getMonth() + 1, d.getDate()].map(function(n) {
      return n.toString().rjust(2, '0');
    }).join(''), 10);
  }

  function second2str(seconds) {
    var minutes = Math.floor(seconds / 60);
    var hours = Math.floor(minutes / 60);
    var suffix = '';

    if (opts.amPM) {
      suffix = 12 <= hours && hours < 24 ? "PM" : "AM";
      hours = ((hours + 11) % 12 + 1);
    } else
      hours = (hours % 24).toString().rjust(2, '0');

    minutes = (minutes % 60).toString().rjust(2, '0');
    return [hours,':',minutes, suffix.small()].join('');
  }

  function time_relative(from, to) {
    return Math.round((to - from) / 60); // in minute
  }

  function is_now() {
    return get_selected_schedule() === 'now';
  }

  function get_selected_schedule() {
    var elem = $('.when-button.selected');
    if (!elem) return;
    return elem.value;
  }

  var DAY_OF_WEEK_MAP = {
    weekday: 1,
    saturday: 6,
    sunday: 0,
  };


  var bombardierIds = train_numbers
    .filter(train => bombardiers.includes(train.trip_short_name))
    .map(train => train.trip_id);


  function get_service_ids(calendar, calendar_dates) {
    console.assert(Object.keys(calendar).length === Object.keys(calendar_dates).length);
    console.assert(Object.keys(calendar).every(key => Object.keys(calendar_dates).includes(key)));

    var target_date = new Date();
    var today_day_of_week = new Date().getDay(); // getDay is "0 for Sunday"

    var target_schedule = get_selected_schedule();
    if (target_schedule === 'now') {
      // when it's now, keep today's date and migrate target_schedule to real one
      switch (today_day_of_week) {
        case 1: case 2: case 3: case 4: case 5: target_schedule = 'weekday'; break;
        case 6: target_schedule = 'saturday'; break;
        case 0: target_schedule = 'sunday'; break;
        default: console.error('Unknown current day', today_day_of_week); return [];
      }
    } else {
      // when it's not, keep the schedule and increment the date until the next that matches schedule and isn't a weird exception case.
      let found = false;
      for (var i = 0; found === false; i++) {
        // TBH this technique is probably still not perfect, alas.
        const daysToShift = (DAY_OF_WEEK_MAP[target_schedule] + 7 - today_day_of_week) % 7;
        const daysToIncrement = (target_schedule === 'saturday' || target_schedule === 'sunday') ? 7 : 1;
        target_date.setDate(target_date.getDate() + daysToShift + (i * daysToIncrement));

        const service_ids = getValidServiceIdsForDate(calendar, target_date, target_schedule);
        if (service_ids.length === 0) continue;

        const {added} = getCalendarExceptions(calendar_dates, target_date);
        found = added.length === 0;
      }
    }

    var service_ids = getValidServiceIdsForDate(calendar, target_date, target_schedule);

    // remove and add service_ids based on the calendar_dates.txt exceptions
    const {added, removed} = getCalendarExceptions(calendar_dates, target_date);
    service_ids = service_ids.filter(service_id => !removed.includes(service_id)).concat(added);

    if (service_ids.length === 0) {
      console.log("Can't get service for now.");
    }
    return service_ids;
  }

  function getValidServiceIdsForDate(calendar, target_date, target_schedule) {
    var date_str = formatDate(target_date);
    // calendar:
    //   service_id => [monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date]
    // calendar_dates:
    //   service_id => [date,exception_type]
    var service_ids = Object.keys(calendar).filter(function(service_id) {
      // check calendar start/end dates
      var item = calendar[service_id];
      return (item.start_date <= date_str) && (date_str <= item.end_date);
    }).filter(function(service_id) {
      // verify there are available calendar available days
      return calendar[service_id][target_schedule];
    });
    return service_ids;
  }

  function getCalendarExceptions(calendar_dates, target_date) {
    const Service = {
      Added: 1,
      Removed: 2,
    };
    const getMatchingDate = (date_str, calendar_date) => calendar_date.find(([exp_date]) => exp_date == date_str) || [];
    const exp_service_ids = Object.keys(calendar_dates);
    const date_str = formatDate(target_date);

    const removed = exp_service_ids.filter((service_id) => {
      const [exception_date, exception_type] = getMatchingDate(date_str, calendar_dates[service_id]);
      if (exception_type === Service.Removed) return true;
    });

    const added = exp_service_ids.filter(function(service_id) {
      const [exception_date, exception_type] = getMatchingDate(date_str, calendar_dates[service_id]);
      if (exception_type === Service.Added) return true;
    });

    return {removed, added};
  }

  function get_available_services(routes, calendar, calendar_dates) {
    var availables = {};

    get_service_ids(calendar, calendar_dates).forEach(function(service_id) {
      Object.keys(routes).forEach(function(route_id) {
        var services = routes[route_id];
        var trips = services[service_id];

        if (!is_defined(trips)) {
          // this route does not have this service
          return;
        }

        if (!is_defined(availables[route_id])) {
          availables[route_id] = {};
        }
        Object.extend(availables[route_id], trips);
      });
    });

    return availables;
  }

  function search_index(trip_ids, target_ids) {
    return target_ids.map(function(target_id) {
      return trip_ids.indexOf(target_id);
    }).filter(function(index) {
      return index != -1;
    });
  }

  function compare_trip(a, b) {
    return a.departure_time - b.departure_time;
  }

  function get_trips(services, from_ids, to_ids, bombardiers) {
    var result = [];

    Object.keys(services)
      .forEach(function(service_id) {
        var trips = services[service_id];
        Object.keys(trips)
          .forEach(function(trip_id) {
            var trip = trips[trip_id];
            var trip_stop_ids = trip.map(function(t) { return t[0]; });
            var from_indexes = search_index(trip_stop_ids, from_ids);
            var to_indexes = search_index(trip_stop_ids, to_ids);
            if (!is_defined(from_indexes) || !is_defined(to_indexes) ||
                from_indexes.length === 0 || to_indexes.length === 0) {
              return;
            }
            var from_index = Math.min.apply(this, from_indexes);
            var to_index = Math.max.apply(this, to_indexes);
            // must be in order
            if (from_index >= to_index) {
              return;
            }

            if (!is_now() || trip[from_index][1] > now()) {
              result.push({
                trip_id: trip_id,
                departure_time: trip[from_index][1],
                arrival_time: trip[to_index][1],
                bombardier: bombardierIds.includes(trip_id)
              });
            }
          });
      });

    return result.sort(compare_trip);
  }

  function render_info(next_train) {
    var info = $('#info');
    info.textContent = '';
    if (is_now() && is_defined(next_train)) {
      var next_relative = time_relative(now(), next_train.departure_time);
      info.textContent = 'Next train: ' + next_relative + 'min';
    }
  }

  function getColorForPercentage(pct) {
    var percentColors = [
      // colors somewhat from http://colorbrewer2.org/
      // green:  hsl(138, 54%, 42%);
      // yellow: hsl(41, 99%, 68%);
      // red     hsl(36, 100%, 50%)
      { pct: 0.0, color: { h: 138, s: 54, l: 42 } },
      { pct: 0.5, color: { h: 41, s: 99, l: 68 } },
      { pct: 1.0, color: { h: 36, s: 87, l: 50 } }];

    // get i value of position between color range above
    var i;
    for (i = 1; i < percentColors.length - 1; i++)
      if (pct < percentColors[i].pct)
        break;

    var lower = percentColors[i - 1];
    var upper = percentColors[i];
    var range = upper.pct - lower.pct;
    var rangePct = (pct - lower.pct) / range;
    var pctLower = 1 - rangePct;
    var pctUpper = rangePct;
    var color = {
      h: Math.floor(lower.color.h * pctLower + upper.color.h * pctUpper),
      s: Math.floor(lower.color.s * pctLower + upper.color.s * pctUpper),
      l: Math.floor(lower.color.l * pctLower + upper.color.l * pctUpper)
    };
    return 'hsl(' + [color.h, ',', color.s, '%, ', color.l, '%'].join('') + ')';
  }

  function render_result(trips) {

    var result = $('#result');

    if (trips.length === 0) {
      result.innerHTML = '<div class="trip no-trips">No Trips Found ¯\\_(ツ)_/¯</div>';
      return;
    }

    var durations = trips.map(function(trip) { return trip.arrival_time - trip.departure_time; });
    var shortest = Math.min.apply(Math, durations);
    var longest = Math.max.apply(Math, durations);

    result.innerHTML = trips.reduce(function (prev, trip) {
      var duration = trip.arrival_time - trip.departure_time;
      var percentage = (duration - shortest) / (longest - shortest);
      var color = getColorForPercentage(percentage);
      // widths should be between 50 and 100.
      var width = (percentage * 50) + 50;

      return prev + ('<div class="trip">' +
                    '<span class="departure"' +
                      (trip.bombardier ? 'data-bombardier="✨"' : '') +
                      '>' + second2str(trip.departure_time) +
                    '</span>' +
                    '<span class="duration">' +
                      time_relative(trip.departure_time, trip.arrival_time) + ' min' +
                      '<span class="durationbar" style="width: ' + width + '%; border-color:' + color + '"></span></span>' +
                    '<span class="arrival">' + second2str(trip.arrival_time) + '</span>' +
                     '</div>');
    }, '');
  }

  window.schedule = function() {
    var stops = data.stops,
        routes = data.routes,
        bombardiers = data.bombardiers,
        calendar = data.calendar,
        calendar_dates = data.calendar_dates;
    var from_ids = stops[$('#from select').value],
      to_ids = stops[$('#to select').value],
      services = get_available_services(routes, calendar, calendar_dates);

    // if some input is invalid, just return
    if (!is_defined(from_ids) || !is_defined(to_ids) || !is_defined(services)) {
      document.body.classList.add('firstrun');
      return;
    }
    document.body.classList.remove('firstrun');

    var trips = get_trips(services, from_ids, to_ids, bombardiers);

    saveScheduleSelection();
    render_info(trips[0]);
    render_result(trips);
  }

  function bind_events() {
    locationSelects.on('change', schedule);

    // toggle from AM PM to 24hr time
    $('body').on('click', function(evt) {
      if (evt.target.matches('.departure, .arrival, small')) {
        opts.amPM = !opts.amPM;
        schedule();
      }
    });

    whenButtons.on('click', function(evt) {
      whenButtons.forEach(function(elem) {
        elem.classList.remove('selected');
      });
      evt.currentTarget.classList.add('selected');
      schedule();
    });

    $('#firstruntrigger').on('click', firstRun)

    $('#reverse').on('click', function() {
      var from = $('#from select').value;
      var to = $('#to select').value;

      select($('#from select'), to);
      select($('#to select'), from);

      schedule();
    });
  }

  function firstRun(locationSelects) {
    const fromselect = $('#fromselect');
    const toselect = $('#toselect');
    fromselect.querySelector('[value="Palo Alto"]').selected = true;
    toselect.querySelector('[value="San Francisco"]').selected = true;
    toselect.dispatchEvent(new Event('change'));
  }

  function constructSelect(name, opts) {
    return '<select id="' + name + 'select">' + opts.reduce(function(prev, curr) {
      return prev + '<option value="' + curr + '">' + curr + '</option>';
    }, '<option disabled selected>Select A Stop</option>') + '</select>';
  }

  function initialize() {
    // init inputs elements
    whenButtons = $$('.when-button');

    // generate select options
    var names = Object.keys(data.stops);
    $('#from').innerHTML = constructSelect('from', names);
    $('#to').innerHTML = constructSelect('to', names);
    locationSelects = $$('#from select, #to select');

    // init
    loadPreviousSettings();
    bind_events();
    schedule(); // init schedule
  }

  function data_checker(names, callback) {
    var mark = {};
    names.forEach(function(name) {
      mark[name] = false;
    });

    return function(name) {
      mark[name] = true;

      var all_true = true;
      for (var n in mark)
        if (!mark[n]) {
          all_true = false;
          break;
        }

      if (all_true)
        callback();
    };
  }

  // init after document and data are ready
  var data_names = ['calendar', 'calendar_dates', 'stops', 'routes', 'bombardiers'];
  var checker = data_checker(data_names, function() {
    initialize();
  });

  // download data
  data_names.forEach(function(name) {
    data[name] = window[name];
    checker(name);
  });

}());
