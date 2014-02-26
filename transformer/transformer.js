/* Transformer.js | (c) 2013 Petro Salema | petrosalema.github.io/transformer */
(function Transformer(global, mandox, math, $) {
	'use strict';

	if (mandox) {
		eval(uate)('transformer.js');
	}

	/**
	 * The unit matrix from which transformations are made.
	 *
	 * The transformation matrix is in column-major order:
	 *
	 * A = | a b tx |
	 *     | c d ty |
	 *
	 * It is represented contiguously as the sequence [ a c  b d  tx ty ]
	 *
	 * where:
	 * <a c> is the vector in the direction of the x-axis,
	 * <b d> is the vector in the direction of the y-axis,
	 * and <tx ty> is the offset from the origin
	 *
	 * References:
	 * https://en.wikipedia.org/wiki/Standard_basis
	 * https://en.wikipedia.org/wiki/Column-major_order#Column-major_order):
	 */
	var STANDARD_BASIS = math.matrix(
		[1, 0, 0],
		[0, 1, 0]
	);

	/**
	 * The vendor prefix for the host rendering engine.
	 *
	 * @type {string}
	 */
	var VENDOR_PREFIX = (function (prefixes) {
		var $element = $('<div></div');
		var i;
		for (i = 0; i < prefixes.length; i++) {
			if (typeof $element.css(prefixes[i] + '-transform') !== 'undefined') {
				return prefixes[i];
			}
		}
		return '';
	}(['-webkit', '-moz', '-o']));

	/**
	 * Enables the user to perform selection on either a specified DOM element
	 * or else on the entire document body.
	 *
	 * @param {jQuery<HTMLElement>} $element
	 */
	function enable_selection($element) {
		($element || $('body')).each(function () {
			$(this).removeAttr('unselectable', 'on')
			       .css(VENDOR_PREFIX + '-user-select', 'all');
		}).each(function () {
			this.onselectstart = null;
		});
	}

	/**
	 * Disables the user from performing selection on either a specified DOM
	 * element or else on the entire document body.
	 *
	 * @param {jQuery<HTMLElement>} $element
	 */
	function disable_selection($element) {
		($element || $('body')).each(function () {
			$(this).attr('unselectable', 'on')
			       .css(VENDOR_PREFIX + '-user-select', 'none');
		}).each(function () {
			this.onselectstart = function () { return false; };
		});
	}

	/**
	 * Angles of the 16-point compass rose.
	 *
	 * Reference: https://en.wikipedia.org/wiki/Compass_rose
	 *
	 * @type {object<string, number>}
	 */
	var compass = (function () {
		var eighth = 45;
		var sixteenth = eighth / 2;
		var n   = 0;
		var e   = 90;
		var s   = 180;
		var w   = 270;
		var ne  = n  + eighth;
		var se  = e  + eighth;
		var sw  = s  + eighth;
		var nw  = w  + eighth;
		var nne = n  + sixteenth;
		var ene = ne + sixteenth;
		var nnw = nw + sixteenth;
		var wnw = w  + sixteenth;
		var sse = s  - sixteenth;
		var ese = se - sixteenth;
		var ssw = sw - sixteenth;
		var wsw = w  - sixteenth;
		return {
			n   : math.to_rad(n),
			e   : math.to_rad(e),
			s   : math.to_rad(s),
			w   : math.to_rad(w),
			ne  : math.to_rad(ne),
			se  : math.to_rad(se),
			sw  : math.to_rad(sw),
			nw  : math.to_rad(nw),
			nne : math.to_rad(nne),
			ene : math.to_rad(ene),
			nnw : math.to_rad(nnw),
			wnw : math.to_rad(wnw),
			sse : math.to_rad(sse),
			ese : math.to_rad(ese),
			ssw : math.to_rad(ssw),
			wsw : math.to_rad(wsw)
		};
	}());

	/**
	 * A class name that every marker will have.  It can be used by the host
	 * application to identify DOM elements which are generated by Transformer.
	 *
	 * @type {string}
	 */
	var MARKER_CLASS = 'transformer-marker-'
	                 + Math.random().toString(32).substr(2);

	/**
	 * DOM elements for the 8 cardinals and ordinals of the compass.
	 *
	 * Reference: https://en.wikipedia.org/wiki/Principal_winds
	 */
	var winds = {
		n  : $('<div class="' + MARKER_CLASS + ' transformer-marker" id="transformer-marker-n" ><div></div></div>').appendTo('body'),
		s  : $('<div class="' + MARKER_CLASS + ' transformer-marker" id="transformer-marker-s" ><div></div></div>').appendTo('body'),
		e  : $('<div class="' + MARKER_CLASS + ' transformer-marker" id="transformer-marker-e" ><div></div></div>').appendTo('body'),
		w  : $('<div class="' + MARKER_CLASS + ' transformer-marker" id="transformer-marker-w" ><div></div></div>').appendTo('body'),
		nw : $('<div class="' + MARKER_CLASS + ' transformer-marker" id="transformer-marker-nw"><div></div></div>').appendTo('body'),
		sw : $('<div class="' + MARKER_CLASS + ' transformer-marker" id="transformer-marker-sw"><div></div></div>').appendTo('body'),
		ne : $('<div class="' + MARKER_CLASS + ' transformer-marker" id="transformer-marker-ne"><div></div></div>').appendTo('body'),
		se : $('<div class="' + MARKER_CLASS + ' transformer-marker" id="transformer-marker-se"><div></div></div>').appendTo('body')
	};

	/**
	 * A jQuery collection of the 8 marker DOM elements
     *
	 * @type {jQuery.<HTMLElement>}
	 */
	var $markers = (function (markers) {
		var $markers = $();
		var point;
		for (point in markers) {
			if (markers.hasOwnProperty(point)) {
				$markers = $markers.add(markers[point]);
			}
		}
		return $markers;
	}(winds));

	/**
	 * The DOM representation of the virtual bounding box around an element.
     *
	 * @type {jQuery.<HTMLElement>}
	 */
	var $boundingbox = $('<div id="transformer-boundingbox">').appendTo('body');

	/**
	 * Representation of the pivot point.
     *
	 * @type {jQuery.<HTMLElement>}
	 */
	var $pivot = $('<div id="transformer-pivot">').appendTo('body');

	/**
	 * Calculates the dimensions of a bounding box for the given element when
	 * orientated according to the specified angle.
	 *
	 * Consider use: getBoundingClientRect()
	 * http://www.quirksmode.org/dom/w3c_cssom.html#t21
	 *
	 * Reference: http://www.codalicio.us/2011/01/how-to-determine-bounding-rectangle-of.html
	 *
	 * @param {jQuery.<HTMLElement>}
	 * @param {number} angle
	 * @returns {Array.<number>} [x, y, w, h]
	 */
	function compute_bounding_box($element, angle) {
		var w = $element.outerWidth();
		var h = $element.outerHeight();

		if (angle > math.HALF_ANGLE) {
			angle -= math.HALF_ANGLE;
		}
		if (angle > math.RIGHT_ANGLE) {
			angle -= math.RIGHT_ANGLE;
			var originalHeight = w;
			w = h;
			h = originalHeight;
		}

		var offset = $element.offset();

		return [
			offset.left,
			offset.top, (
				// Because a = cos(q) * h
				(Math.cos(math.RIGHT_ANGLE - angle) * h)
				+
				(Math.cos(angle) * w)
			), (
				// Because o = sin(q) * h
				(Math.sin(math.RIGHT_ANGLE - angle) * h)
				+
				(Math.sin(angle) * w)
			)
		];
	}

	/**
	 * Calculates the absolute center coordinates of the given bounding box.
	 *
	 * @param {Array.<number>} box
	 */
	function compute_origin(box) {
		return [box[0] + (box[2] / 2), box[1] + (box[3] / 2)];
	}

	/**
	 * Generates a matrix transformation CSS string to transform an element.
	 *
	 * References:
	 * http://www.w3.org/TR/SVG/coords.html#TransformMatrixDefined
	 * http://www.useragentman.com/IETransformTranslator/
	 * http://dev.opera.com/articles/view/understanding-the-css-transforms-matrix/#calculatingtransform
	 * https://developer.mozilla.org/en-US/docs/CSS/trasnform
	 * http://en.wikipedia.org/wiki/Coordinate_rotation
	 * http://en.wikipedia.org/wiki/Transformation_matrix
	 *
	 * @param {object} operation
	 */
	function css_transformation_matrix(operation) {
		var matrix = STANDARD_BASIS;
		if (typeof operation.rotation !== 'undefined') {
			matrix = math.m_rotate(matrix, operation.rotation);
		}
		if (typeof operation.translation !== 'undefined') {
			matrix = math.m_translate(matrix, operation.translation);
		}
		if (typeof operation.scaling !== 'undefined') {
			matrix = math.m_scale(matrix, operation.scale);
		}
		if (typeof operation.skew !== 'undefined') {
			matrix = math.m_skew(matrix, operation.skew);
		}
		return 'matrix(' + matrix.toString() + ')';
	}

	/**
	 * Given that the matrix A,
	 *
	 * A = | a b tx |
	 *     | c d ty |,
	 *
	 * is represented as the sequence [ a c  b d  tx ty ],
	 *
	 * then the rotation of A = atan(c/d) = atan(-b/a)
	 *
	 * Reference:
	 * http://stackoverflow.com/questions/4361242/extract-rotation-scale-values-from-2d-transformation-matrix
	 *
	 * @todo: Use parseFloat()
	 *
	 * @param {Array.<number>} matrix
	 * @return {number}
	 */
	function get_rotation_angle(matrix) {
		var rotation = Math.atan(matrix[1] / matrix[3]);

		// Because singularities exists at multiples of 90°.  This means that
		// deriving the rotation angle from a rotation matrix is ambiguous.  In
		// order to resolve this ambiguity, it is necessary to determine in
		// which quadrant in the cartesian coordinate system the x-axis vector
		// is in, and with it, modify the derived rotation angle if necessary.
		if (matrix[0] < 0) {
			rotation += math.HALF_ANGLE;
		}

		return math.normalize_angle(rotation);
	}

	/**
	 * Gets an elements angle of transformation rotation in radians.
	 *
	 * @param jQuery.<HTMLElement> $element
	 * @return {number}
	 */
	function get_element_rotation($element) {
		var matrix = $element.css(VENDOR_PREFIX + '-transform')
		                     .match(math.SIGNED_FLOATING_POINT);
		return matrix ? get_rotation_angle(matrix) : 0;
	}

	/**
	 * Get the directional unit vector corresponding to the given angle.
	 *
	 * @param {number} angle
	 * @return {Array.<number>}
	 */
	function getDirectionVector(angle) {
		// Because the atan2() function expects the angle of the normal to be
		// calculated from the origin (0, 0).
		var directional = math.normalize_angle(angle) - math.RIGHT_ANGLE;
		return [Math.cos(directional), Math.sin(directional)];
	}

	/**
	 * Given a cardinal or ordinal direction, will return the corresponding
	 * direction at a given angle from it.
	 *
	 * Reference: https://en.wikipedia.org/wiki/Cardinal_direction
	 *
	 * @param {string} point
	 * @param {number} angle
	 * @return {string}
	 */
	var get_compass_direction = (function () {
		return function get_compass_direction(point, angle) {
			angle = math.normalize_angle(angle + compass[point]);
			return ((angle < compass.nne)
				? 'n'
				: (angle < compass.ene)
				? 'ne'
				: (angle < compass.ese)
				? 'e'
				: (angle < compass.sse)
				? 'se'
				: (angle < compass.ssw)
				? 's'
				: (angle < compass.wsw)
				? 'sw'
				: (angle < compass.wnw)
				? 'w'
				: (angle < compass.nnw)
				? 'nw'
				: 'n');
		};
	}());

	/**
	 * Updates the resize CSS cursors property of all the marker elements.
	 *
	 * @param {object} orientation
	 */
	var update_cursors = (function () {
		var cursors = {
			n  : 'ns-resize',
			e  : 'ew-resize',
			s  : 'ns-resize',
			sw : 'sw-resize',
			se : 'se-resize',
			nw : 'nw-resize'
		};
		return function update_cursors(orientation) {
			var point;
			for (point in winds) {
				if (winds.hasOwnProperty(point)) {
					winds[point].css(
						'cursor',
						cursors[get_compass_direction(
							point,
							orientation.rotation
						)]
					);
				}
			}
		};
	}());

	/**
	 * Applies styling to the markers.
	 */
	function style_markers(style) {
		var radius, color;
		if ('squares' === style) {
			radius = 0;
			color = '#fff';
		} else {
			radius = 8;
			color = '#f34';
		}
		$markers.find('>div').css({
			borderRadius: radius,
			backgroundColor: color
		});
	}

	/**
	 * Marks the given operation with with markers, a bounding box, and a pivot
	 * point.
	 *
	 * @param {object} orientation
	 */
	function mark(orientation) {
		if (!orientation) {
			return;
		}

		var width = orientation.$element.outerWidth();
		var height = orientation.$element.outerHeight();

		var n  = [0, -height / 2];
		var s  = [0,       -n[1]];
		var e  = [width / 2,   0];
		var w  = [-e[0],       0];
		var nw = [w[0],     n[1]];
		var ne = [e[0],     n[1]];
		var sw = [w[0],     s[1]];
		var se = [e[0],     s[1]];

		var directions = {
			n  : n,
			s  : s,
			e  : e,
			w  : w,
			nw : nw,
			ne : ne,
			sw : sw,
			se : se
		};

		var origin = compute_origin(compute_bounding_box(
			orientation.$element,
			orientation.rotation
		));

		var point;
		var pos;
		for (point in directions) {
			if (directions.hasOwnProperty(point)) {
				pos = math.v_add(
					math.v_rotate(directions[point], orientation.rotation),
					origin
				);
				winds[point].css('left', pos[0]).css('top', pos[1]).show();
			}
		}

		var offset = orientation.$element.offset();

		$boundingbox.show().offset(offset)
		            .css('width', (origin[0] - offset.left) * 2)
		            .css('height', (origin[1] - offset.top) * 2);

		$pivot.show().css('left', origin[0]).css('top', origin[1]);

		update_cursors(orientation);
	}

	/**
	 * Hides markers, pivot, and bounding box.
	 */
	function unmark() {
		$pivot.hide();
		$markers.hide();
		$boundingbox.hide();
	}

	unmark();


	// ---------- `creating ----------


	/**
	 * Initializes a box creation process.
	 *
	 * @param {jQuery.<HTMLElement>} $element
	 * @param {number} x
	 * @param {number} y
	 * @return {object}
	 */
	function start_creating($element, x, y) {
		var offset = $element.offset();
		$element.css({
			position: 'absolute',
			left: x - offset.left,
			top: y - offset.top
		});
		return {create: {
			$element: $element,
			x: x,
			y: y,
			rotation: 0
		}};
	}

	/**
	 * Updates the creation process for the coordinates (x, y).
	 *
	 * @param {object} operation
	 * @param {number} x
	 * @param {number} y
	 */
	function update_creating(operation, x, y) {
		operation.$element.css({
			width: x - operation.x,
			height: y - operation.y
		});
	}


	// ---------- `rotating ----------


	/**
	 * Initializes rotation.
	 *
	 * @param {jQuery.<HTMLElement>} $element
	 * @param {number} x
	 * @param {number} y
	 * @return {object}
	 */
	function start_rotating($element, x, y) {
		var rotation = get_element_rotation($element);
		var bounding = compute_bounding_box($element, rotation);
		var anchor = [x, y];
		var origin = compute_origin(bounding);
		var angle = math.angular_direction(math.v_subtract(anchor, origin));

		return {rotate: {
			x: bounding[0],
			y: bounding[1],
			$element : $element,
			origin: origin,
			anchor: anchor,
			angle: angle,
			rotation: rotation
		}};
	}

	/**
	 * Updates the rotation operation according to the new coordinates (x, y).
	 *
	 * @param {object} operation
	 * @param {number} x
	 * @param {number} y
	 */
	function update_rotating(operation, x, y) {
		var theta = math.angular_direction(
			math.v_subtract([x, y], operation.origin)
		);
		operation.rotation = math.normalize_angle(
			operation.rotation + (theta - operation.angle)
		);
		operation.angle = theta;
		operation.$element.css(
			VENDOR_PREFIX + '-transform',
			css_transformation_matrix(operation)
		);
	}


	// ---------- `resizing ----------

	/**
	 * Initializes resizing.
	 *
	 * @param {jQuery.<HTMLElement>} $element
	 * @param {number} x
	 * @param {number} y
	 * @param {jQuery.<HTMLElement>} marker
	 */
	function start_resizing($element, x, y, $marker) {
		$marker = $marker.closest('.' + MARKER_CLASS);

		var direction = $marker[0].id.replace('transformer-marker-', '');
		var offset = $marker.offset();
		var rotation = get_element_rotation($element);
		var normal = compass[direction] + rotation;

		return {resize: {
			$marker: $marker,
			$element: $element,
			direction: getDirectionVector(normal),
			start: [offset.left, offset.top],
			normal: normal,
			compassDirection: direction,
			rotation: rotation
		}};
	}

	/**
	 * Updates the resizing operation according to the new coordinates (x, y).
	 *
	 * @param {object} operation
	 * @param {number} x
	 * @param {number} y
	 */
	function update_resizing(operation, x, y) {
		var delta = [x - operation.start[0], y - operation.start[1]];
		var direction = operation.direction;
		var $element = operation.$element;
		var projection = math.v_project(delta, direction);
		var position = math.v_add(operation.start, projection);
		var scalarProjection = math.v_scalar_projection(delta, direction);
		var offset = $element.offset();

		if ('w' === operation.compassDirection
				|| 'e' === operation.compassDirection) {
			operation.w = $element.width() + scalarProjection;
			$element.width($element.width() + scalarProjection);
		} else if ('n' === operation.compassDirection
				|| 's' === operation.compassDirection) {
			$element.height($element.height() + scalarProjection);
		}

		if (direction[0] < 0) {
			offset.left = offset.left + (scalarProjection * direction[0]);
		}
		if (direction[1] < 0) {
			offset.top = offset.top + (scalarProjection * direction[1]);
		}

		$element.offset(offset);

		operation.$marker.css({
			left: position[0],
			top: position[1]
		});

		operation.start = position;
	}


	// ---------- `moving ----------

	/**
	 * Initializes moving.
	 *
	 * @param {jQuery.<HTMLElement>} $element
	 * @param {number} x
	 * @param {number} y
	 */
	function start_moving($element, x, y) {
		return {move: {
			$element: $element,
			position: [x, y],
			rotation: get_element_rotation($element)
		}};
	}

	/**
	 * Updates the resizing operation according to the new coordinates (x, y).
	 *
	 * @param {object} operation
	 * @param {number} x
	 * @param {number} y
	 */
	function update_moving(operation, x, y) {
		var offset = operation.$element.offset();
		var position = [x, y];
		var current = [offset.left, offset.top];
		var delta = math.v_add(
			current,
			math.v_subtract(position, operation.position)
		);
		operation.$element.offset({
			left : delta[0],
			top  : delta[1]
		});
		operation.position = position;
	}

	/**
	 * An map of operation initialization functions mapped against their api
	 * name.
	 *
	 * @param {object<string, function>}
	 */
	var operations = {
		create : start_creating,
		rotate : start_rotating,
		resize : start_resizing,
		move   : start_moving
	};

	/**
	 * Starts the specified operation.
	 *
	 * @param {string} operation
	 * @param {jQuery.<HTMLElement>} $element
	 * @param {Event} event
	 * @param {object?} other
	 */
	function start(operation, $element, event, other) {
		if (operations[operation]) {
			disable_selection();
			return operations[operation](
				$element,
				event.pageX,
				event.pageY,
				other
			);
		}
		throw 'Transformer: Unknown operation "' + operation + '"';
	}

	/**
	 * Updates the given operation at the current event.
	 *
	 * @param {object} operation
	 * @param {Event} event
	 */
	function update(operation, event) {
		var x = event.pageX;
		var y = event.pageY;
		if (operation.create) {
			update_creating(operation.create, x, y);
			return operation.create;
		}
		if (operation.rotate) {
			update_rotating(operation.rotate, x, y);
			return operation.rotate;
		}
		if (operation.resize) {
			update_resizing(operation.resize, x, y);
			return operation.resize;
		}
		if (operation.move) {
			update_moving(operation.move, x, y);
			return operation.move;
		}
	}

	/**
	 * Ends the given operation.
	 *
	 * @param {object} operation
	 * @return {object}
	 */
	function end(operation) {
		enable_selection();
		return (
			operation.create
				|| operation.rotate
					|| operation.resize
						|| operation.move
		);
	}

/*
                      ..';:::;;'..
               .;cdk0XNWMMMMMMMMWNX0kdc,.
 .KXXXXXXK;  :NMMMMMMMMMWNXXXXNNWMMMMMMMWXl  '0KKKKKK0.
 0MMMMMMMl  ,WMMMMMMNx,.      ..lXMMMMMMMd  lMMMMMMMK.
  oMMWloKWO.  'o0WMMMMMXd,    .l0WMMMMMNk:. .kWXdlWMMd
  ,WMWl. 'oOkc.  .l0WMMMMMKdd0WMMMMMXx;. .:xOd,  cWMW;
  KMMWKx;. 'l0Ol.  .l0WMMMMMMMMWXd,  .:k0d,  ,dKWMMK.
   xMMW;,lkxl' .cxOd,  .:xXMMNkc.  'okkl' .cxko;:WMMx
   cMMMKo' .:x0d;..0W'  '  ''  .. 'N0. 'o0kc. .l0MMMc
   :kNMMWKo, .;x0xXMd  kKo,,l00. oMXd0k:. .l0WMMWOl.
      .:kNMMMKd,  ,dNX. ,WMMMMW: .KWk:. 'o0WMMNOc.
     ..  .;xXMMMXd,'XMl  OMMMMO  cWX.'oKWMMNk:.  ..
     cW0l'   ;d00KK0XX0. lMMMM: .0NNKXXKKx:.  'l0Wc
     ,MMMX.              ;MMMN.  .           .XMMM;
     .NMMN:              ;MMMN.              ;NMMN.
      0MMMMXd,     .:xk  ;MMMN. .0d,      ,dXMMMMK
      dMMMMMMMK. 'OWMM0  ;MMMN. .NMMK:  .KMMMMMMMx
      cMMMMMMMX. :MMMM0  ;MMMN. .NMMMx  .XMMMMMMMc
      'NMMMMMMX. cMMMM0  'OOOk. .NMMMd  .XMMMMMMW'
      .KMMMMMMK. cMMMM0         .NMMMd  .KMMMMMMK.
       oNMMMMMK  cMMMMNkxxxxxxxxOWMMMo   0MMMMMNo
        .;xXMM0  lMMMK,         .kMMMo   0MMXx;.
            ,dx  lMMK.  .ccccc:.  OMMo   xd;
                 lMO.  .KMMMMMMO. .XWl
                  ,.   d00000000c  .,

                more than meets the eye
*/
	global.Transformer = {
		start_creating : start_creating,
		start_rotating : start_rotating,
		start_resizing : start_resizing,
		start_moving   : start_moving,

		update_creating : update_creating,
		update_rotating : update_rotating,
		update_resizing : update_resizing,
		update_moving   : update_moving,

		start  : start,
		update : update,
		end    : end,

		mark   : mark,
		unmark : unmark,

		style_markers: style_markers,

		get_element_rotation: get_element_rotation,
		get_compass_direction: get_compass_direction,

		enable_selection: enable_selection,
		disable_selection: disable_selection,

		VENDOR_PREFIX: VENDOR_PREFIX,
		MARKER_CLASS: MARKER_CLASS
	};

}(this, this.mandox, this.MathUtil, this.jQuery));
