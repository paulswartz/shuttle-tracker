// taken from https://github.com/jhermsmeier/node-google-polyline
function decode_polyline( value ) {

  var values = decode_polyline.integers( value );
  var points = [];

  for( var i = 0; i < values.length; i += 2 ) {
    points.push([
        ( values[ i + 0 ] += ( values[ i - 2 ] || 0 ) ) / 1e5,
        ( values[ i + 1 ] += ( values[ i - 1 ] || 0 ) ) / 1e5,
    ])
  }
  return points;
}


decode_polyline.sign = function( value ) {
  return value & 1 ? ~( value >>> 1 ) : ( value >>> 1 )
}

decode_polyline.integers = function( value ) {
  var values = [], byte = 0, current = 0, bits = 0;
  for( var i = 0; i < value.length; i++ ) {
    byte = value.charCodeAt( i ) - 63;
    current = current | (( byte & 0x1F ) << bits )
    bits = bits + 5

    if( byte < 0x20 ) {
      values.push( decode_polyline.sign( current ) )
      current = 0
      bits = 0
    }
  }
  return values
}
