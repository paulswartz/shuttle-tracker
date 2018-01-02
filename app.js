window.setTimeout(function() {
  location.reload();
}, 1000 * 60 * 30);

function Vehicle(vehicle, included, map) {
  this.vehicle_id_ = vehicle.id;
  this.route_ = included.find(data => data.id == vehicle.relationships.route.data.id);

  this.setMap(map);

  this.stop_ = null;
  this.div_ = null;
  this.marker_ = new google.maps.Marker({
    map: map
  });

  this.update(vehicle, included);
}

function shapes_url() {
  return ENV.V3_API_URL + "/shapes?filter[route]=" + shape_route() + "&include=stops&api_key=" + ENV.MBTA_API_KEY + get_date_filter();
}

function vehicles_url() {
  return ENV.V3_API_URL + "/vehicles?filter[route]=" + vehicle_route() + "&include=route,stop&api_key=" + ENV.MBTA_API_KEY + get_date_filter();
}

function shape_route() {
  return "Shuttle005";
}

function vehicle_route() {
  // return "Shuttle005"
  return "202,210,212"

}

function schedules_url() {
  const now = new Date();
  let hour = now.getHours() + 1;
  let minute = now.getMinutes() + 1;
  hour = hour < 10 ? ("0" + hour) : hour;
  minute = minute < 10 ? ("0" + minute) : minute;
  return ENV.V3_API_URL + "/schedules?filter[route]=" + shape_route() +
                              "&filter[min_time]=" + hour + minute +
                              "&filter[max_time]=" + hour + minute +
                              "&api_key=" + ENV.MBTA_API_KEY +
                              get_date_filter();
}

function get_date_filter() {
  return "&filter[date]=2018-01-08"
}

function promise_request(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.onload = () => resolve(xhr.responseText);
    xhr.onerror = () => reject(xhr.statusText);
    xhr.send();
  });
}

function draw_shape(shape, map, included, stop_hash) {
  const polyline = decode_polyline(shape.attributes.polyline)
                      .map(points => { return {lat: points[0], lng: points[1]} });
  return {
    shape:  new google.maps.Polyline({
      path: polyline,
      icons: [{
        icon: {
          path: google.maps.SymbolPath.FORWARD_OPEN_ARROW,
          strokeColor: "#000000",
          strokeOpacity: 0.5,
          scale: 1.8
        },
        repeat: "3%",
      }],
      strokeColor: "#000000",
      strokeOpacity: 0.5,
      map: map
    }),
    stops: shape.relationships.stops.data.forEach(draw_stop(map, included, stop_hash))
  }
}

function draw_stop(map, included, stop_hash) {
  return function do_draw_stop(stop_data) {
    if (!stop_hash[stop_data.id]) {
      const stop = included.find(included_stop => { return included_stop.id == stop_data.id });
      stop_hash[stop_data.id] = new google.maps.Marker({
        position: {
          lat: stop.attributes.latitude,
          lng: stop.attributes.longitude
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          labelOrigin: label_origin(stop.id),
          scale: 5
        },
        label: {
          text: stop.attributes.name,
          fontWeight: "bold"
        },
        draggable: false,
        map: map,
        zIndex: 1000,
        id: stop.id
      });
    }
  }
}

function label_origin(id) {
  switch (id) {
    case "place-nqncy":
      return {x: -10, y: 0}
      break;
    case "place-qnctr":
      return {x: 10, y: 0}
      break;
    case "place-qamnl":
      return {x: 12, y: 0}
      break;
    case "place-brntn":
      return {x: -9, y: 0}
      break;
    case "3025":
      return {x: 20, y: 0}
      break;
    case "3038":
      return {x: 15, y: 0}
      break;
    case "3052":
      return {x: 17, y: 0}
      break;
    case "9170099":
      return {x: -17, y: 0}
      break;
    case "9070099":
      return {x: -31, y: -3}
      break;
    case "9170100":
      return {x: -25, y: 0}
      break;
    case "9070100":
      return {x: 32, y: 2}
      break;
    case "9070101":
      return {x: -20, y: 3}
      break;
    case "9270099":
      return {x: 25, y: 0}
      break;
    default:
      return {x: 10, y: 0}
      break;
  }
}


function add_shape(shape_hash, map, included, stop_hash) {
  return function do_add_shape(new_shape) {
    if (!shape_hash[new_shape.id]) {
      shape_hash[new_shape.id] = draw_shape(new_shape, map, included, stop_hash);
    }
  }
}

function load_map_data(map, shape_hash, vehicle_hash, stop_hash) {
  Promise.all([promise_request(vehicles_url()),
               promise_request(schedules_url()),
               promise_request(shapes_url())]).then(data => {
    const new_vehicles = JSON.parse(data[0]);
    const schedules = JSON.parse(data[1]);
    const new_shapes = JSON.parse(data[2]);
    if (new_shapes && new_shapes.data) {
      new_shapes.data.slice(0).forEach(add_shape(shape_hash, map, new_shapes.included, stop_hash));
    } else {
      console.error("unexpected result for new_shapes", new_shapes);
    }

    if (new_vehicles && new_vehicles.data && new_vehicles.included) {
      Object.keys(vehicle_hash).forEach(update_vehicle_hash(vehicle_hash, new_vehicles));
      new_vehicles.data.forEach(add_new_vehicle(vehicle_hash, map, new_vehicles.included.slice(0)))
    } else {
      console.error("unexpected result for new_vehicles", new_vehicles);
    }

    window.setTimeout(function(){ load_map_data(map, shape_hash, vehicle_hash, stop_hash) }, 3000);
  })
}

function update_vehicle_hash(vehicle_hash, new_vehicles) {
  return id => {
    const new_data = new_vehicles.data.find(vehicle => vehicle.id == id);
    if (new_data) {
      vehicle_hash[id].update(new_data, new_vehicles.included.slice(0))
    } else if (vehicle_hash[id]) {
      vehicle_hash[id].setMap(null);
      vehicle_hash[id] = null;
    }
  }
}

function add_new_vehicle(vehicle_hash, map, included) {
  return new_vehicle => {
    if (!vehicle_hash[new_vehicle.id]) {
      vehicle_hash[new_vehicle.id] = new Vehicle(new_vehicle, included, map)
    }
  }
}

function init_map() {
  Vehicle.prototype = new google.maps.OverlayView();

  Vehicle.prototype.onAdd = function() {
    const div = document.createElement("div");
    div.id = this.vehicle_id_
    div.classList.add("vehicle");

    const label_div = document.createElement("div");
    label_div.classList.add("vehicle__label");

    div.appendChild(label_div);

    this.divs_ = {
      container: div,
      label: label_div
    }

    const panes = this.getPanes();
    panes.overlayLayer.appendChild(div);
  }

  Vehicle.prototype.draw = function() {
    this.update_marker();
    if (this.divs_) {
      this.divs_.label.textContent = this.label_text();
      const overlayProjection = this.getProjection();
      if (overlayProjection) {
        const loc = overlayProjection.fromLatLngToDivPixel(this.get_position());
        this.divs_.container.style.left = loc.x + "px";
        this.divs_.container.style.top = loc.y + "px";
      }
    }
  };

  Vehicle.prototype.onRemove = function() {
    this.divs_.container.parentElement.removeChild(this.divs_.container);
    this.marker_.setMap(null);
    this.marker_ = null;
    return false;
  }

  Vehicle.prototype.icon_opts = function() {
    return {
      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      strokeColor: this.get_color(),
      scale: 5,
      rotation: this.attributes_.bearing
    }
  }

  Vehicle.prototype.get_color = function() {
    switch (this.route_.id) {
      default:
        return "#FF0000";
    }
  }

  Vehicle.prototype.get_position = function() {
    return new google.maps.LatLng(this.attributes_.latitude, this.attributes_.longitude);
  }

  Vehicle.prototype.update_stop = function(stops) {
    this.stop_ = stops.find(data => data.id == this.relationships_.stop.data.id);
  }

  Vehicle.prototype.update_marker = function() {
    this.marker_.setPosition(this.get_position());
    this.marker_.setIcon(this.icon_opts());
  }

  Vehicle.prototype.update = function(new_data, stops) {
    this.attributes_ = new_data.attributes;
    this.relationships_ = new_data.relationships;

    this.update_stop(stops);

    this.draw();
  }

  Vehicle.prototype.label_text = function() {
    return ["Route",
            this.route_.attributes.short_name,
            "(" + this.route_.attributes.direction_names[this.attributes_.direction_id] + ")",
            // "Vehicle",
            // this.attributes_.label,
            this.attributes_.current_status.toLowerCase().split("_").join(" "),
            this.stop_.attributes.name].join(" ");
  }

  const beale_at_library = {lat: 42.266671, lng: -71.017924}
  const map = new google.maps.Map(document.getElementById('map'), {
    zoom: 15,
    center: beale_at_library,
    mapTypeControl: false,
    streetViewControl: false,
    styles: [{
      featureType: 'poi',
      stylers: [{visibility: 'off'}]
    }, {
      featureType: 'administrative',
      stylers: [{visibility: 'off'}]
    }]
  });
  window.vehicle_map = map;
  load_map_data(map, {}, {}, {});
}
