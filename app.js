var api_url = "https://dev.api.mbtace.com";

function shuttle_route_url() {
  return api_url + "/routes?filter%5Bstop%5D=place-nqncy,place-qnctr" + get_date_filter();
}

function shapes_url() {
  return api_url + "/shapes?filter%5Broute%5D=Red&include=route,stops" + get_date_filter();
}

function vehicles_url() {
  return api_url + "/vehicles?filter%5Broute%5D=Red&include=trip,stop" + get_date_filter();
}

function get_date_filter() {
  var date = new Date();
  // return "&filter%5Bdate%5D="+ "2018" +"-"+ "01" +"-"+ "08" + "&api_key=" + MBTA_API_KEY;
  return "&filter%5Bdate%5D="+ date.getFullYear() +"-"+ (date.getMonth() + 1) +"-"+ date.getDate() + "&api_key=" + MBTA_API_KEY;
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

function is_shuttle_shape(shape) { return true; }

function is_shuttle_vehicle(stop_ids) {
  return function do_is_shuttle_vehicle(vehicle) {
    return true
  }
}

function draw_shape(shape, map, included) {
  const polyline = decode_polyline(shape.attributes.polyline)
                      .map(points => { return {lat: points[0], lng: points[1]} });

  return {
    shape:  new google.maps.Polyline({
      path: polyline,
      strokeColor: "#000000",
      strokeOpacity: 0.1,
      map: map
    }),
    stops: shape.relationships.stops.data.map(draw_stop(map, included))
  }
}

function draw_vehicle(vehicle, map, included) {
  const stop = included.find(data => data.id == vehicle.relationships.stop.data.id);
  const vehicle_title = ["Vehicle",
                          vehicle.attributes.label,
                          vehicle.attributes.current_status.toLowerCase().split("_").join(" "),
                          stop.attributes.name].join(" ");
  const color = stop.attributes.name.split(" - ").pop() == "Outbound" ? "#FF0000" : "#000000";
  return new google.maps.Marker({
    position: {
      lat: vehicle.attributes.latitude,
      lng: vehicle.attributes.longitude
    },
    title: vehicle_title,
    icon: {
      path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
      strokeColor: "#FF0000",
      scale: 3,
      rotation: vehicle.attributes.bearing
    },
    draggable: false,
    map: map
  });
}

function draw_stop(map, included) {
  return function do_draw_stop(stop_data) {
    const stop = included.find(included_stop => { return included_stop.id == stop_data.id });
    return new google.maps.Marker({
      position: {
        lat: stop.attributes.latitude,
        lng: stop.attributes.longitude
      },
      title: stop.attributes.name,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        strokeColor: "#000000",
        scale: 3
      },
      draggable: false,
      map: map,
      id: stop.id
    });
  }
}

function add_shape(shape_hash, map, included) {
  return function do_add_shape(new_shape) {
    if (!shape_hash[new_shape.id]) {
      shape_hash[new_shape.id] = draw_shape(new_shape, map, included);
    }
  }
}

function load_map_data(map, shape_hash, vehicle_hash) {
  Promise.all([promise_request(shapes_url()), promise_request(vehicles_url())]).then(data => {
    const json = data.map(str => JSON.parse(str));
    const new_shapes = JSON.parse(data[0]);
    const new_vehicles = JSON.parse(data[1]);
    new_shapes.data.slice(0).forEach(add_shape(shape_hash, map, new_shapes.included));
    Object.keys(vehicle_hash).forEach(id => {
      const new_data = new_vehicles.data.find(vehicle => vehicle.id == id);
      if (new_data) {
        vehicle_hash[id].setPosition({
          lat: new_data.attributes.latitude,
          lng: new_data.attributes.longitude
        })
      } else {
        delete vehicle_hash[id];
      }
    });
    new_vehicles.data.forEach(new_vehicle => {
      if (!vehicle_hash[new_vehicle.id]) {
        vehicle_hash[new_vehicle.id] = draw_vehicle(new_vehicle, map, new_vehicles.included.slice(0))
      }
    })

    window.setTimeout(function(){ load_map_data(map, shape_hash, vehicle_hash) }, 3000);
  })
}

function init_map() {
  const map = new google.maps.Map(document.getElementById('map'), {
    zoom: 13,
    center: {lat: 42.241241, lng: -71.005297}
  });
  window.vehicle_map = map;
  load_map_data(map, [], []);
}
