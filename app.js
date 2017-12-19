var api_url = "https://dev.api.mbtace.com";

function shuttle_route_url() {
  return api_url + "/routes?filter%5Bstop%5D=place-nqncy,place-qnctr" + get_date_filter();
}

function shapes_url() {
  return api_url + "/shapes?filter%5Broute%5D=Red&include=route,stops" + get_date_filter();
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

function is_shuttle_shape(shape) { return shape.id.includes("Quincy"); }

function draw_shuttle_route(map, included) {
  return function do_draw_shuttle_route(shuttle, i) {
    const color = i == 0 ? "#FF0000" : "#000000";
    const polyline = decode_polyline(shuttle.attributes.polyline)
                       .map(points => { return {lat: points[0], lng: points[1]} });
    new google.maps.Polyline({
      path: polyline,
      strokeColor: color,
      strokeOpacity: 0.5,
      map: map
    });
    shuttle.relationships.stops.data.map(render_stop(map, included, color, i));
  }
}

function render_stop(map, included, color, i) {
  return function do_render_stop(stop_data) {
    const stop = included.find(included_stop => { return included_stop.id == stop_data.id });
    return new google.maps.Marker({
      position: {
        lat: stop.attributes.latitude,
        lng: stop.attributes.longitude
      },
      title: stop.attributes.name,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        strokeColor: color,
        scale: 3,
        rotation: 180 * -i
      },
      draggable: false,
      map: map,
      id: stop.id
    });
  }
}

function init_map() {
  promise_request(shapes_url()).then(data => {
    const map = new google.maps.Map(document.getElementById('map'), {
      zoom: 13,
      center: {lat: 42.241241, lng: -71.005297}
    });
    const json  = JSON.parse(data)
    json.data
        .filter(is_shuttle_shape)
        .forEach(draw_shuttle_route(map, json.included));
  });
}
