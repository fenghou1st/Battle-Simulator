
function Game(elementId)
{
    try
    {
        this.node = null;
        this.stats = null;
        this.width = null;
        this.height = null;
        this.initNodes(elementId);

        this.camera = null;
        this.scene = null;
        this.renderer = null;
        this.geometry = null;
        this.material = null;

        this.cursor = null;
        this.cursor_tile = null;

        this.terrain_id = 16;
        this.tile_rows = terrains[this.terrain_id].rows;
        this.tile_cols = terrains[this.terrain_id].cols;
        this.tile_image_width = 16;
        this.tile_image_height = 16;
        this.tile_width = 128;
        this.tile_height = 128;
        this.map_x_min = 0;
        this.map_x_max = this.tile_cols * this.tile_width;
        this.map_z_min = 0;
        this.map_z_max = this.tile_rows * this.tile_height;

        this.present_chars = [];
        this.present_char_meshes = [];

        this.initData();

        this.animation_frame = null;
        this.initialize_list = {onLoadSystemImages: false, onLoadTiles: false, onLoadCharacters: false};
        this.mouseX = null;
        this.mouseY = null;
        this.curr_time = null; // unit: ms
        this.delta_time = null; // unit: ms
        this.initEvents();
    }
    catch(e)
    {
        if (e instanceof Error)
            console.log("Failed to initialize game: " + e.message);
        else
            console.log("Failed to initialize game: " + JSON.stringify(e));
    }
}


Game.prototype =
{
    initNodes: function(elementId)
    {
        this.node = document.getElementById(elementId);

        this.stats = new Stats();
        this.node.appendChild(this.stats.domElement);

        this.width = this.node.clientWidth;
        this.height = this.node.clientHeight;
    },


    initData: function()
    {
        this.loadPresentCharacters();

        //
        if (this.present_chars.length > 0)
            this.cursor = new THREE.Vector3(
                (this.present_chars[0].location.x + 0.5) * this.tile_width,
                0,
                (this.present_chars[0].location.y + 0.5) * this.tile_height);
        else
            this.cursor = new THREE.Vector3(
                (Math.floor(this.tile_rows / 2) + 0.5) * this.tile_width,
                0,
                (Math.floor(this.tile_cols / 2) + 0.5) * this.tile_height);

        this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 1, 2000);
        this.camera.position.x = this.cursor.x;
        this.camera.position.y = 500;
        this.camera.position.z = this.cursor.z + 250;

        //
        this.scene = new THREE.Scene();

        this.scene.fog = new THREE.Fog(0xF2F7FF, 1, 2000);

        this.scene.add(new THREE.AmbientLight(0x808080));

        var light = new THREE.DirectionalLight(0xFFFFFF, 1);
        light.position.set(1, 1, 1);
        this.scene.add(light);

        //
        var self = this;
        var textureLoader = new THREE.TextureLoader();
        textureLoader.load("textures/system.png", function(texture) {self.onLoadSystemImages(texture);});
        textureLoader.load("textures/tiles0.png", function(texture) {self.onLoadTiles(texture);});
        textureLoader.load("textures/characters.png", function(texture) {self.onLoadCharacters(texture);});

        //
        this.renderer = new THREE.WebGLRenderer({antialias: true});
        this.renderer.setClearColor(this.scene.fog.color);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(this.width, this.height);
        this.renderer.autoClear = false;

        this.node.appendChild(this.renderer.domElement);
    },


    initEvents: function()
    {
        var self = this;

        window.addEventListener("resize", function()
        {
            self.calcDimensions();
        });

        document.addEventListener('mousemove', function(event)
        {
            self.onDocumentMouseMove(event);
        }, false);

        document.addEventListener("keydown", function(event)
        {
            self.onDocumentKeyDown(event);
        }, false);
    },


    start: function()
    {
        this.animate();
    },


    pause: function()
    {
        window.cancelAnimationFrame(this.animation_frame);
    },


    animate: function()
    {
        var self = this;
        this.animation_frame = window.requestAnimationFrame(function() {self.animate();});

        var curr_time = new Date().getTime();
        this.delta_time = this.curr_time > 0 ? curr_time - this.curr_time : 0;
        this.curr_time = curr_time;

        this.render();
        this.stats.update();
    },


    render: function()
    {
        if (!this.isInitialized()) return;

        //
        this.camera.lookAt(this.cursor);

        //
        this.updatePresentCharacters();

        //
        this.renderer.clear();
        this.renderer.setScissorTest(true);

        this.renderer.setScissor(0, 0, this.width, this.height);
        this.renderer.render(this.scene, this.camera);

        this.renderer.setScissorTest(false);
    },


    isInitialized: function()
    {
        for (var key in this.initialize_list)
        {
            if (!this.initialize_list.hasOwnProperty(key)) continue;

            if (!this.initialize_list[key]) return false;
        }

        return true;
    },


    updatePresentCharacters: function()
    {
        for (var i = 0; i < this.present_chars.length; ++i)
        {
            var char = characters[this.present_chars[i].character_id];
            var present = character_presentations[char.presentation_id];
            var action = this.present_chars[i].action;

            //
            var action_total_time = 0;
            for (var j = 0; j < present.actions[action].length; ++j)
                action_total_time += present.actions[action][j].duration;

            var animation_time = this.curr_time % action_total_time;
            var animation_step = 0;
            var test_animation_time = 0;
            for (var j = 0; j < present.actions[action].length; ++j)
            {
                test_animation_time += present.actions[action][j].duration;

                if (animation_time < test_animation_time)
                {
                    animation_step = j;
                    break;
                }
            }

            //
            var texture_id = present.actions[action][animation_step].texture_id;
            var texture_group = present.texture_group;
            var texture_rect = present.textures[texture_id];

            var texture = this.present_char_meshes[i].material.map;
            var geometry = this.present_char_meshes[i].geometry;
            var epsilon_u = 1.0 / texture.image.width * 0.1;
            var epsilon_v = 1.0 / texture.image.height * 0.1;

            var rect = [
                new THREE.Vector2(
                    texture_rect[0] / texture.image.width + epsilon_u,
                    1 - texture_rect[1] / texture.image.height - epsilon_v),
                new THREE.Vector2(
                    texture_rect[0] / texture.image.width + epsilon_u,
                    1 - (texture_rect[1] + texture_rect[3]) / texture.image.height + epsilon_v),
                new THREE.Vector2(
                    (texture_rect[0] + texture_rect[2]) / texture.image.width - epsilon_u,
                    1 - (texture_rect[1] + texture_rect[3]) / texture.image.height + epsilon_v),
                new THREE.Vector2(
                    (texture_rect[0] + texture_rect[2]) / texture.image.width - epsilon_u,
                    1 - texture_rect[1] / texture.image.height - epsilon_v)
            ];

            geometry.faceVertexUvs[0][0][0].set(rect[0].x, rect[0].y);
            geometry.faceVertexUvs[0][0][1].set(rect[1].x, rect[1].y);
            geometry.faceVertexUvs[0][0][2].set(rect[3].x, rect[3].y);
            geometry.faceVertexUvs[0][1][0].set(rect[1].x, rect[1].y);
            geometry.faceVertexUvs[0][1][1].set(rect[2].x, rect[2].y);
            geometry.faceVertexUvs[0][1][2].set(rect[3].x, rect[3].y);
            geometry.uvsNeedUpdate = true;
        }
    },


    onLoadSystemImages: function(texture)
    {
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;

        var material = new THREE.MeshBasicMaterial({map: texture, transparent: true});

        this.loadCursor(material, system_images.cursor);

        this.initialize_list.onLoadSystemImages = true;
    },


    onLoadTiles: function(texture)
    {
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;

        var material = new THREE.MeshBasicMaterial({map: texture});

        var columns = Math.floor(texture.image.width / this.tile_image_width);
        var rows = Math.floor(texture.image.height / this.tile_image_height);
        var unit_width = this.tile_image_width / texture.image.width;
        var unit_height = this.tile_image_height / texture.image.height;
        var epsilon_u = 1.0 / texture.image.width * 0.1;
        var epsilon_v = 1.0 / texture.image.height * 0.1;

        var tiles = terrains[this.terrain_id].tiles;

        for (var i = 0; i < this.tile_rows; ++i)
        {
            for (var j = 0; j < this.tile_cols; ++j)
            {
                var geometry = new THREE.PlaneGeometry(this.tile_width, this.tile_height);

                var tile_id = tiles[i * this.tile_cols + j];
                var columnId = Math.floor(tile_id % columns);
                var rowId = Math.floor(tile_id / columns);

                var rect = [
                    new THREE.Vector2(
                        columnId * unit_width + epsilon_u,
                        (rows - rowId) * unit_height - epsilon_v),
                    new THREE.Vector2(
                        columnId * unit_width + epsilon_u,
                        (rows - rowId - 1) * unit_height + epsilon_v),
                    new THREE.Vector2(
                        (columnId + 1) * unit_width - epsilon_u,
                        (rows - rowId - 1) * unit_height + epsilon_v),
                    new THREE.Vector2(
                        (columnId + 1) * unit_width - epsilon_u,
                        (rows - rowId) * unit_height - epsilon_v)
                ];

                geometry.faceVertexUvs[0] = [];
                geometry.faceVertexUvs[0][0] = [rect[0], rect[1], rect[3]];
                geometry.faceVertexUvs[0][1] = [rect[1], rect[2], rect[3]];

                //
                var tile = new THREE.Mesh(geometry, material);

                tile.position.x = (j + 1 / 2) * this.tile_width;
                tile.position.y = 0;
                tile.position.z = (i + 1 / 2) * this.tile_height;

                tile.rotation.x = - Math.PI / 2;

                this.scene.add(tile);
            }
        }

        this.initialize_list.onLoadTiles = true;
    },


    onLoadCharacters: function(texture)
    {
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;

        var material = new THREE.MeshBasicMaterial({map: texture, transparent: true});

        var epsilon_u = 1.0 / texture.image.width * 0.1;
        var epsilon_v = 1.0 / texture.image.height * 0.1;

        for (var i = 0; i < this.present_chars.length; ++i)
        {
            var char = characters[this.present_chars[i].character_id];
            var present = character_presentations[char.presentation_id];
            var location = this.present_chars[i].location;
            var action = this.present_chars[i].action;

            var texture_id = present.actions[action][0].texture_id;
            var texture_group = present.texture_group;
            var texture_rect = present.textures[texture_id];

            //
            var geometry = new THREE.PlaneGeometry(
                this.tile_width * char.size[0] / 100.0, this.tile_height * char.size[1] / 100.0);

            var rect = [
                new THREE.Vector2(
                    texture_rect[0] / material.map.image.width + epsilon_u,
                    1 - texture_rect[1] / material.map.image.height - epsilon_v),
                new THREE.Vector2(
                    texture_rect[0] / material.map.image.width + epsilon_u,
                    1 - (texture_rect[1] + texture_rect[3]) / material.map.image.height + epsilon_v),
                new THREE.Vector2(
                    (texture_rect[0] + texture_rect[2]) / material.map.image.width - epsilon_u,
                    1 - (texture_rect[1] + texture_rect[3]) / material.map.image.height + epsilon_v),
                new THREE.Vector2(
                    (texture_rect[0] + texture_rect[2]) / material.map.image.width - epsilon_u,
                    1 - texture_rect[1] / material.map.image.height - epsilon_v)
            ];

            geometry.faceVertexUvs[0] = [];
            geometry.faceVertexUvs[0][0] = [rect[0], rect[1], rect[3]];
            geometry.faceVertexUvs[0][1] = [rect[1], rect[2], rect[3]];

            //
            var mesh = new THREE.Mesh(geometry, material);

            mesh.position.x = (location.x + 1 / 2) * this.tile_width;
            mesh.position.y = this.tile_height / 2;
            mesh.position.z = (location.y + 1 / 2) * this.tile_height;

            mesh.rotation.x = - Math.PI / 4;

            //
            this.present_char_meshes[i] = mesh;
            this.scene.add(mesh);
        }

        this.initialize_list.onLoadCharacters = true;
    },


    loadCursor: function(material, texture_rect)
    {
        var geometry = new THREE.PlaneGeometry(this.tile_width, this.tile_height);

        var rect = [
            new THREE.Vector2(
                texture_rect[0] / material.map.image.width,
                1 - texture_rect[1] / material.map.image.height),
            new THREE.Vector2(
                texture_rect[0] / material.map.image.width,
                1 - (texture_rect[1] + texture_rect[3]) / material.map.image.height),
            new THREE.Vector2(
                (texture_rect[0] + texture_rect[2]) / material.map.image.width,
                1 - (texture_rect[1] + texture_rect[3]) / material.map.image.height),
            new THREE.Vector2(
                (texture_rect[0] + texture_rect[2]) / material.map.image.width,
                1 - texture_rect[1] / material.map.image.height)
        ];

        geometry.faceVertexUvs[0] = [];
        geometry.faceVertexUvs[0][0] = [rect[0], rect[1], rect[3]];
        geometry.faceVertexUvs[0][1] = [rect[1], rect[2], rect[3]];

        //
        this.cursor_tile = new THREE.Mesh(geometry, material);

        this.cursor_tile.position.x = this.cursor.x;
        this.cursor_tile.position.y = 1;
        this.cursor_tile.position.z = this.cursor.z;

        this.cursor_tile.rotation.x = - Math.PI / 2;

        this.scene.add(this.cursor_tile);
    },


    loadPresentCharacters: function()
    {
        this.present_chars = [];
        this.present_chars.push(new PresentCharacter(40, 4, 10));
        this.present_chars.push(new PresentCharacter(42, 4, 11));
        this.present_chars.push(new PresentCharacter(18, 4, 12));
        this.present_chars.push(new PresentCharacter(36, 4, 13));
        this.present_chars.push(new PresentCharacter(34, 4, 14));

        this.present_chars.push(new PresentCharacter(37, 6, 2));
        this.present_chars.push(new PresentCharacter(31, 5, 2));
        this.present_chars.push(new PresentCharacter(31, 7, 2));
        this.present_chars.push(new PresentCharacter(43, 6, 3));
        this.present_chars.push(new PresentCharacter(25, 3, 6));
        this.present_chars.push(new PresentCharacter(25, 9, 6));
        this.present_chars.push(new PresentCharacter(7, 8, 10));
        this.present_chars.push(new PresentCharacter(7, 8, 11));
        this.present_chars.push(new PresentCharacter(7, 8, 12));
        this.present_chars.push(new PresentCharacter(7, 8, 13));
        this.present_chars.push(new PresentCharacter(7, 8, 14));
    },


    calcDimensions: function()
    {
        this.width = this.node.clientWidth;
        this.height = this.node.clientHeight;

        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(this.width, this.height);
    },


    onDocumentMouseMove: function(event)
    {
        this.mouseX = event.clientX;
        this.mouseY = event.clientY;
    },


    onDocumentKeyDown: function(event)
    {
        switch (event.which)
        {
            case 38: // cursor up
                if (this.cursor.z - this.tile_height >= this.map_z_min)
                {
                    this.cursor.z -= this.tile_height;
                    this.camera.position.z -= this.tile_height;
                    this.cursor_tile.position.z = this.cursor.z;
                }
                break;
            case 40: // cursor down
                if (this.cursor.z + this.tile_height < this.map_z_max)
                {
                    this.cursor.z += this.tile_height;
                    this.camera.position.z += this.tile_height;
                    this.cursor_tile.position.z = this.cursor.z;
                }
                break;
            case 37: // cursor left
                if (this.cursor.x - this.tile_width >= this.map_x_min)
                {
                    this.cursor.x -= this.tile_width;
                    this.camera.position.x -= this.tile_width;
                    this.cursor_tile.position.x = this.cursor.x;
                }
                break;
            case 39: // cursor right
                if (this.cursor.x + this.tile_width < this.map_x_max)
                {
                    this.cursor.x += this.tile_width;
                    this.camera.position.x += this.tile_width;
                    this.cursor_tile.position.x = this.cursor.x;
                }
                break;
            case 33: // page up
                if (this.camera.position.y + 100 <= 1000) this.camera.position.y += 100;
                break;
            case 34: // page down
                if (this.camera.position.y - 100 >= 100) this.camera.position.y -= 100;
                break;
        }
    }
};


// PresentCharacter ////////////////////////////////////////////////////////////////////////////////////////////////////
function PresentCharacter(character_id, x, y, action)
{
    this.character_id = character_id;
    this.location = new THREE.Vector2(x, y);
    this.action = action || "stand"; // stand | move | fight | die

    this.faction_id = 0; // own | friend | neutral | enemy

    this.hp = 100;
}


PresentCharacter.prototype = {};
