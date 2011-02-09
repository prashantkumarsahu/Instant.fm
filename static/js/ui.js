// Called automatically on browser resize
function updateDisplay() {
    // window - (header + footer + good measure)
    var mainHeight = $(window).height() - (50 + 50 + 5);
    $('#main').height((mainHeight > 0) ? mainHeight : 0);
    
    // - player - playlist toolbar
    var playlistDivHeight = mainHeight - $('#videoDiv').height() - 27;
    $('#playlistDiv').height((playlistDivHeight > 0) ? playlistDivHeight : 0);
    
    // + enough to hide the jittery toggleVideo resize
    var playlistDisplayHeight = mainHeight - 6;
    $('#playlistDisplay').height(playlistDisplayHeight);
    
    // - toolbar
    var browserHeight = mainHeight - 45;
    browserHeight = (browserHeight > 0) ? browserHeight : 0;
    $('#browser').height(browserHeight);
    $('#nowPlayingContainer').height(browserHeight);
    
    // + good measure
    // Save the top position of the browser in it's closed state.
    browser.closedCSSTop = mainHeight + 5;
    
    // Set it immediately, if the browser is closed. If the browser is open, don't do anything.
    if (!browser.isOpen) {
        $('#modal').removeClass('animate');
        browser.toggle(false);
        
        window.setTimeout(function() {
            $('#modal').addClass('animate');
        }, 0);
    }
}

function makeSeeMoreLink(onclick, _text) {
    _text = _text || 'more';
    return $('<a class="seeMore" href="#seeMore">('+_text+')</a>').click(onclick);
}

// Shows more information about a song, album, or artist by expanding the text
// @event - the triggering event
function onShowMoreText(event) {
    event.preventDefault();

    var elem = $(this).parent();
    var newContent = elem.data('longContent') + ' ';
    var link = makeSeeMoreLink(onShowLessText, 'less');

    elem.html(newContent)
        .append(link);
}

// Shows less information about a song, album, or artist by shrinking the text
// @event - the triggering event
function onShowLessText(event) {
    event.preventDefault();

    var elem = $(this).parent();
    var newContent = elem.data('shortContent') + ' ';
    var link = makeSeeMoreLink(onShowMoreText);

    elem
        .html(newContent)
        .append(link);
}

/* -------------------------- REUSABLE LIST COMPONENTS ------------------------ */

// Takes an array of objects with properties 't', 'a', 'i' 
function SongList(options) {
    this.renderChunkSize = 500; // Render playlist in chunks so we don't lock up
    this.renderTimeout = 100; // Time between rendering each chunk
    
    this.songs = options.songs;
    this.onClick = options.onClick;
    this.buttons = options.buttons;
    this.id = options.id
    this.listItemIdPrefix = options.listItemIdPrefix;
    this.numberList = !!options.numberList;
    
    var that = this;
    this.buttonHelper = function(i, song, _songNum) {
        return function(event) {
            event.preventDefault();
            event.stopPropagation();
            that.buttons[i].action.apply(this, [event, song]);
        };
    };
}

SongList.prototype.render = function(addToElem, _callback) {
    this.elem = $('<ul></ul>')
        .disableSelection()
        .appendTo(addToElem);
        
    if (this.id) {
        this.elem.attr('id', this.id);
    }
    
    this._renderHelper(0, _callback);
};

SongList.prototype._renderHelper = function(start, _callback) {
    if (start >= this.songs.length) { // we're done
        _callback && _callback();
        return;
    }
    
    var end = Math.min(start + this.renderChunkSize, this.songs.length);    	
    for (var i = start; i < end; i++) {
        var song = this.songs[i];    
        var $newSongItem = this._makeItem(song, i);
        this.elem.append($newSongItem);
    }
    
    var that = this;
    window.setTimeout(function() {
        that._renderHelper(start + that.renderChunkSize, _callback);
    }, that.renderTimeout);
};

SongList.prototype._makeItem = function(song, _songNum) {
    var $buttonActions = $('<div class="songActions"></div>');
    for (var i = 0; i < this.buttons.length; i++) {
        $('<div></div>')
            .addClass(this.buttons[i].className)
            .text(this.buttons[i].text || '')
            .click(this.buttonHelper(i, song))
            .appendTo($buttonActions);
    }
    
    var that = this;
    var imgSrc = song.i ? song.i : '/images/unknown.png';
    var $songListItem = $('<li class="songListItem clearfix"></li>')
        .append(this.numberList ? '<div class="num">'+(_songNum+1)+'</div>' : '')
        .append('<img src="'+ imgSrc +'">') // No alt text. Want to avoid alt-text flash while img loads
        .append('<div class="songInfo"><span class="title">'+song.t+'</span><span class="artist">'+song.a+'</span></div>')
        .append($buttonActions)
        .click(function(event) {
            event.preventDefault();
            that.onClick.apply(this, [song, _songNum]);
        });
        
    if (_songNum !== undefined && this.listItemIdPrefix) {
        $songListItem.attr('id', this.listItemIdPrefix + _songNum);
    }
            
    return $songListItem;
};

// Add a new song to this songlist instance.
// Song needs to have 't' and 'a' attributes.
SongList.prototype.add = function(song) {
    var songNum = this.songs.length;
    var that = this;
    this._makeItem(song, songNum)
        .click(function(event) {
            event.preventDefault();
            that.onClick.apply(this, [song, songNum]);
        })
        .appendTo(this.elem);
};

// Try to fetch all the album art we can.
SongList.prototype.fetchAlbumImgs = function() {
    this.concurrentReqs = 0;
    for (this.albumUpdateInd = 0;
         this.albumUpdateInd < this.songs.length && this.concurrentReqs < 2; // Max # of reqs to Last.fm
         this.albumUpdateInd++) {
        
        var song = this.songs[this.albumUpdateInd];
        if (song.i === undefined) {
            this._fetchAlbumImgsHelper(this.albumUpdateInd, song);
        	this.concurrentReqs++;
        }
    }
    this.albumUpdateInd--;
};

SongList.prototype._fetchAlbumImgsHelper = function(albumIndex, song) {
    var that = this;
    var continueFetching = function() {
        that.albumUpdateInd++;
        that._fetchAlbumImgsHelper(that.albumUpdateInd, that.songs[that.albumUpdateInd]);
    };
    
    if (albumIndex >= this.songs.length) { // we're done
        this.concurrentReqs--;
    
        if (!this.concurrentReqs) {
            this.albumUpdateFinished = true;
            model.saveSongs();
        }
        return;
    }
    
    if (albumIndex % 25 == 0) {
        model.saveSongs();
    }
    
    // Don't try to refetch albums that already have art
    if (song.i !== undefined) {
        continueFetching();
        return;
    }
    
    model.lastfm.track.search({
	    artist: song.a || '',
	    limit: 1,
	    track: (song.t && cleanSongTitle(song.t)) || ''
	}, {
	    success: function(data) {
	        var track = data.results && data.results.trackmatches && data.results.trackmatches.track;
	        var albumImg = track && track.image && track.image[track.image.length - 1]['#text'];
            
            if (albumImg) {
                $('#song'+albumIndex+' img').attr('src', albumImg);
                that.songs[albumIndex].i = albumImg;
            } else {
                that.songs[albumIndex].i = null; // Mark songs without art so we don't try to fetch it in the future
            }
            continueFetching();
	    },
	    error: function(code, message) {
	        log(code + ' ' + message);
		}
	});
};

// Takes an array of objects with properties 'name', 'image' 
function makeArtistList(artists) {
    var result = $('<div></div>');
    for (var i = 0; i < artists.length; i++) {
        var artist = artists[i];
        
        if (!artist.image) {
            artist.image = '/images/anonymous.png';
        }
        
        // No alt text. Want to avoid alt-text flash while img loads
        var img = $('<img src="'+artist.image+'">');
        
        $('<a></a>', {
			'class': 'artistResult',
			href: '/'+canonicalize(artist.name),
			rel: 'partial artist',
			title: artist.name
		})
            .append('<div>'+artist.name+'</div>')
            .append(img)
            .appendTo(result);
    }
    return result;
}


// Takes an array of objects with properties 'name', 'artist', 'image'
function makeAlbumList(albums) {
    var result = $('<div></div>');
    for (var i = 0; i < albums.length; i++) {
        var album = albums[i];

        if (!album.image) {
            album.image = '/images/unknown.png';
        }

        // No alt text. Want to avoid alt-text flash while img loads
        var img = $('<img src="' + album.image + '">');

        $('<a></a>', {
			'class': 'albumResult',
			href: '/'+canonicalize(album.artist)+'/'+canonicalize(album.name),
			rel: 'partial album',
			title: album.name
		})
        .append('<span class="mask"></span>'+'<div>' + album.name + '<span class="artistName">' + album.artist + '</span></div>')
        .append(img)
        .appendTo(result);
    }
    return result;
}