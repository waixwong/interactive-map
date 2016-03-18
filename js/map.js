// global variables
var scene;
var camera;
var renderer;
var controll;
var orbit;

var mouse = new THREE.Vector2();
var raycaster;

// d3 projection method
var projection;
var features;

var showParticles = false;

//var gui = new dat.GUI();

function init() {
    $('#overlay').hide();
    $('.census-tract').hide();

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.x = -2;
    camera.position.y = -5;
    camera.position.z = 10;
    camera.setLens(100);
    var target = new THREE.Vector3(1, 1, 0);
    camera.lookAt(target);

    // initialize renderer and add to the html element
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        //preserveDrawingBuffer: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x151515);

    document.getElementById("container").appendChild(renderer.domElement);

    raycaster = new THREE.Raycaster();

    // load data and construct map geometry
    d3.json("data/CensusBlocks.json", function(error, jsonData) {
        if (error) throw error;

        features = jsonData.features;
        // project the path to a 20*10 plane:
        var width = 20,
            height = 10;

        projection = d3.geo.mercator();
        projection.scale(1).translate([0, 0]);
        var path = d3.geo.path().projection(projection);

        // Measure path bounds and update projection method so that
        // the projected map is in the center of the projected plane.
        var b = path.bounds(jsonData);
        var s = 0.95 / Math.max((b[1][0] - b[0][0]) / width, (b[1][1] - b[0][1]) / height);
        var t = [(width - s * (b[1][0] + b[0][0])) / 2, (height - s * (b[1][1] + b[0][1])) / 2];

        projection.scale(s).translate(t);

        var updatedBound = path.bounds(jsonData);
        var min = updatedBound[0];
        var max = updatedBound[1];

        particleSystem = new THREE.Points();
        particles = new THREE.Geometry();
        // add particles after the projection is calculated.
        d3.json("data/social.json", function(error, socialData) {
            if (error) throw error;
            // Project social media latlng to 3d coordinates
            for (var media in socialData) {
                for (var i = 0; i < socialData[media].length; i++) {
                    try {
                        var latlng = [Number(socialData[media][i][1]), Number(socialData[media][i][0])];
                        var coordinates = projection(latlng);

                        // Only add point that's within the bound of Bernallio county.
                        if (min[0] < coordinates[0] && coordinates[0] < max[0] && min[1] < coordinates[1] && coordinates[1] < max[1]) {
                            var particle = new THREE.Vector3(coordinates[0], coordinates[1], 0);
                            particle.velocity = new THREE.Vector3(0, 0, -Math.random() * 0.5);
                            particles.vertices.push(particle);

                        }
                        if (isNaN(coordinates[0]) || isNaN(coordinates[1])) throw 'nan';
                    } catch (err) {
                        console.log(err);
                        continue;
                    }
                }
            }

            var pMaterial = new THREE.PointsMaterial({
                color: 0x5fccf5, // twitter color
                size: 0.2,
                blending: THREE.AdditiveBlending,
                transparent: true,
                opacity: 0.5
            });

            particleSystem.geometry = particles;
            particleSystem.material = pMaterial;
            scene.add(particleSystem);
        });

        // now convert geojson coordinates to a shape path.
        var pathString = path(jsonData);

        // Convert the shape path to three.js shapes.
        var shapes = transformSVGPathExposed(pathString);

        // Extrude the shapes to make the map geometries:
        var extrudeOptions = {
            amount: -0.5,
            bevelEnabled: false,
            steps: 1
        };

        // group all shapes
        statistics = jsonData.statistics;

        mapGroup = new THREE.Object3D();
        var edgeHelperGroup = new THREE.Object3D();
        for (i = 0; i < shapes.length; i++) {
            var geometry = new THREE.ExtrudeGeometry(shapes[i], extrudeOptions);
            var mesh = new THREE.Mesh(geometry);

            mesh.material.opacity = 0.75; //0.75;
            mesh.material.transparent = true;
            mesh.material.polygonOffset = true;
            mesh.material.polygonOffsetFactor = 1;
            mesh.material.polygonOffsetUnits = 2;
            mesh.material.side = THREE.DoubleSide;

            var edges = new THREE.EdgesHelper(mesh, mesh.material.color.clone().multiplyScalar(0.7), 65);
            edges.material.linewidth = 1;

            mesh.edgeHelper = edges;
            edgeHelperGroup.add(edges);

            // census info:
            var census = {};
            var tract = features[i].properties.TRACTCE;
            var population = Number(features[i].properties.ACS_13_5YR_B01001_with_ann_HD01_VD01);
            var male = Number(features[i].properties.ACS_13_5YR_B01001_with_ann_HD01_VD02);
            var female = Number(features[i].properties.ACS_13_5YR_B01001_with_ann_HD01_VD26);

            // push some extra census data into mesh object
            mesh.census = {
                featureIndex: i,
                tract: tract,
                population: population,
                male: male,
                female: female,
                proportion_to_max_population: population / statistics.max_population,
                proportion_to_max_male: male / statistics.max_population,
                proportion_to_max_female: female / statistics.max_population
            };
            mapGroup.add(mesh);
        }

        scene.add(mapGroup);
        scene.add(edgeHelperGroup);

        // find the center of the group and apply transform so that
        // the mesh appears at the world origin.
        var box = new THREE.Box3().setFromObject(mapGroup);
        var center = box.center();

        var mat = new THREE.Matrix4();
        mat.makeRotationX(Math.PI);
        mat.setPosition({
            x: -center.x,
            y: center.y,
            z: 0
        });
        mapGroup.applyMatrix(mat);
        particleSystem.applyMatrix(mat);
        particleSystem.position.z = 0.2;

        window.addEventListener('resize', onWindowResize, false);

        render();
        animateCamera();
    });
}

function animateCamera() {
    var target = new THREE.Vector3(1, 1, 0);

    var camAnim1 = new TWEEN.Tween(camera.position);
    camAnim1.to({
        x: 0.5,
        y: -45,
        z: 45
    }, 3000).onUpdate(function() {
        camera.lookAt(target);
    });

    camAnim1.easing(TWEEN.Easing.Cubic.InOut);
    camAnim1.delay(1000);
    camAnim1.onComplete(camAnimationCompleted);

    var camAnim2 = new TWEEN.Tween(target).to({
        x: 0.5,
        y: 4,
        z: 1
    }, 2600);
    camAnim2.easing(TWEEN.Easing.Cubic.InOut);
    camAnim2.delay(1000);

    camAnim1.start();
    camAnim2.start();
}

function addOrbitControl() {
    orbit = new THREE.OrbitControls(camera, renderer.domElement);
    orbit.enableZoom = true;
    orbit.enableRotate = true;
}

function animateParticles() {
    var pCount = particles.vertices.length;

    while (pCount--) {
        // get the particle
        var particle = particles.vertices[pCount];

        // check if we need to reset
        if (particle.z < -10.0) {
            particle.z = 0;
            particle.velocity.z = 0;
        }

        // update the velocity with a splat of randomniz
        particle.velocity.z -= Math.random() * 0.01;

        // and the position
        particle.z += particle.velocity.z;
    }

    // flag to the particle system that vertices needs to be updated.
    particleSystem.geometry.verticesNeedUpdate = true;
}

var pickedMesh, lastPickedMesh;

function checkForInterections() {
    // calculate objects intersecting the picking ray
    camera.updateProjectionMatrix();
    raycaster.setFromCamera(mouse, camera);
    var intersects = raycaster.intersectObjects(mapGroup.children, true);

    if (intersects.length === 0) pickedMesh = null;
    else {
        for (i = 0; i < intersects.length; i++) {
            if (intersects[i].object.geometry instanceof THREE.ExtrudeGeometry) {
                pickedMesh = intersects[i].object;
            }
        }
    }
    updateInfoOnScreen();
}

function updateInfoOnScreen() {
    if (pickedMesh) {
        var index = pickedMesh.census.featureIndex;
        // find out county name:
        var population = pickedMesh.census.population;

        $('#total-counter').addClass('activated').text(pickedMesh.census.population);
        $('#male-counter').addClass('activated').text(pickedMesh.census.male);
        $('#female-counter').addClass('activated').text(pickedMesh.census.female);
        $('.census-tract').show();
        $('.census-tract>i').text(pickedMesh.census.tract);
    } else {
        resetInfoOnScreen();
    }
}

function resetInfoOnScreen() {
    $('.counter').each(function() {
        $(this).text($(this).attr('property'));
        $(this).removeClass('activated');
    });

    $('.census-tract').hide();
}

function camAnimationCompleted() {
    // mouseIn event
    $('.counter-trigger').hover(function() {
            // set counter value
            var target = $('#' + this.getAttribute('target'));
            var property = target.attr('property');
            var value = statistics[property];
            target.text(value);
            target.addClass('activated');

            // temporarily pause ray-mesh interesection check
            window.removeEventListener('mousemove', onMouseMove, false);

            // start animation
            animateAllMapObjectsIn(property);

        },
        // mouseOut event
        function() {
            animateAllMapObjectsOut();
            // resume intersection check.
            window.addEventListener('mousemove', onMouseMove, false);
        });

    $('#overlay').fadeIn(300, function() {
        window.addEventListener('mousemove', onMouseMove, false);
        //addOrbitControl();
    });

    // add button click event
    $('.showbtn').click(function() {
        if (showParticles) {
            showParticles = false;
            scene.remove(particleSystem);
        } else {
            showParticles = true;
            scene.add(particleSystem);
        }
    });
}

var duration = 350;

function animateMapObjects() {
    TWEEN.update();

    if (!pickedMesh && !lastPickedMesh) {
        // if nothing is selected
        return;
    }

    // picking changed:
    if (pickedMesh != lastPickedMesh) {
        // picked another object
        if (pickedMesh) {
            var extrudeAnim = new TWEEN.Tween(pickedMesh.scale);
            extrudeAnim.to({
                z: 15
            }, duration);
            extrudeAnim.easing(TWEEN.Easing.Cubic.InOut);
            extrudeAnim.start();

        }
        // last object isnt null, animate it back to original
        if (lastPickedMesh) {
            var shrinkAnim = new TWEEN.Tween(lastPickedMesh.scale);
            shrinkAnim.to({
                z: 1
            }, duration);
            shrinkAnim.easing(TWEEN.Easing.Cubic.InOut);
            shrinkAnim.start();

        }
        lastPickedMesh = pickedMesh;
    }
}

function animateAllMapObjectsIn(property) {
    var key = 'proportion_to_max_' + property;
    TWEEN.removeAll();
    for (i = 0; i < mapGroup.children.length; i++) {
        var mesh = mapGroup.children[i];
        var proportion = mesh.census[key];
        var globalAnim = new TWEEN.Tween(mesh.scale);
        globalAnim.to({
            z: 14 * proportion + 1
        }, duration);
        globalAnim.easing(TWEEN.Easing.Cubic.InOut);
        globalAnim.start();
    }
}

function animateAllMapObjectsOut() {
    TWEEN.removeAll();
    for (i = 0; i < mapGroup.children.length; i++) {
        var mesh = mapGroup.children[i];
        var globalAnim = new TWEEN.Tween(mesh.scale);
        globalAnim.to({
            z: 1
        }, duration + (Math.random() - 0.5) * 400);
        globalAnim.easing(TWEEN.Easing.Cubic.InOut);
        globalAnim.start();
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseMove(event) {
    event.preventDefault();
    // calcluate mouse position in normalized device coordinates
    // (-1 to +1) for both components
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    checkForInterections();
}

function render() {
    animateMapObjects();
    if (showParticles) animateParticles();
    renderer.render(scene, camera);
    requestAnimationFrame(render);
    //orbit.update();
}

// initialize the scene when the window is done loading.
window.onload = init;
