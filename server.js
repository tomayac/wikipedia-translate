var Lazy = require('lazy');
var fs = require('fs');
var request = require('request');
var async = require('async');

(function() {

  var USER_AGENT = 'Wikipedia Translator * Contact: tomac(a)google.com.';

  var countryToLanguage = {
    France: 'fr',
    Italy: 'it',
    Spain: 'es',
    Austria: 'de'
  };

  var targetLanguages = {
    'ru': [ // http://en.wikipedia.org/wiki/Cyrillic_script
      'ru',
      'bg',
      'bs',
      'be',
      'be-x-old',
      'kk',
      'ky',
      'mk',
      'mn',
      'sr',
      'tg',
      'uk']
  };

  var arrayUnique = function(array) {
    var temp = {};
    array.forEach(function(value) {
      temp[value] = undefined;
    });
    return Object.keys(temp);
  };

  var searchCity = function(language, country, region, city, url, callback) {
    request.get(
        {
          uri: url,
          headers: {'User-Agent': USER_AGENT}
        },
        function(error, response, body) {
      if (!error && response.statusCode === 200) {
        try {
          body = JSON.parse(body);
          if ((body && body.query && body.query.search) &&
              (Array.isArray(body.query.search))) {
            var results = [];
            body.query.search.forEach(function(result) {
              results.push(result.title);
            });
            callback(null, {
              language: language,
              country: country,
              region: region,
              city: city,
              results: results
            });
          } else {
            callback(false, null);
          }
        } catch(e) {
          callback(false, null);
        }
      } else {
        callback(false, null);
      }
    });
  };

  var getCategories = function(article) {
    var url = 'http://' + article.language + '.wikipedia.org/w/api.php' +
        '?action=query' +
        '&prop=categories' +
        '&format=json' +
        '&limit=1' +
        '&titles=' + article.results.join('|');
    request.get(
        {
          uri: url,
          headers: {'User-Agent': USER_AGENT}
        },
        function(error, response, body) {
      if (!error && response.statusCode === 200) {
        try {
          body = JSON.parse(body);
          if (body && body.query && body.query.pages) {
            var categories = [];
            for (var pageId in body.query.pages) {
              var categoryObjects = body.query.pages[pageId].categories;
              categoryObjects.forEach(function(categoryObject) {
                var title = categoryObject.title.split(':')[1];
                categories.push(title);
              });
            }
            article.categories = arrayUnique(categories);
            getTranslation(article);
          } else {
            // handle error
          }
        } catch(e) {
          // handle error
        }
      } else {
        // handle error
      }
    });
  };

  var getTranslation = function(article) {
    var url = 'http://' + article.language + '.wikipedia.org/w/api.php' +
        '?action=query' +
        '&prop=langlinks' +
        '&format=json' +
        '&lllimit=500' +
        '&titles=' + article.results.join('|');
    request.get(
        {
          uri: url,
          headers: {'User-Agent': USER_AGENT}
        },
        function(error, response, body) {
      if (!error && response.statusCode === 200) {
        try {
          body = JSON.parse(body);
          if (body && body.query && body.query.pages) {
            var translated = [];
            for (var pageId in body.query.pages) {
              var languageObjects = body.query.pages[pageId].langlinks;
              for (var i = 0, len = languageObjects.length; i < len; i++) {
                var languageObject = languageObjects[i];
                if (targetLanguages['ru'].indexOf(languageObject.lang) !== -1) {
                  translated.push(languageObject['*']);
                }
              }
            }
            article.translated = arrayUnique(translated);
            console.log('Translated "' + article.country + ',' + article.region +
                ',' + article.city + '" to "' + article.translated + '"');
            outStream.write(
                article.language + '\t' +
                article.country + '\t' +
                article.region + '\t' +
                article.city + '\t' +
                article.results.join('|') + '\t' +
                article.translated.join('|') + '\n');
          } else {
            // handle error
          }
        } catch(e) {
          // handle error
        }
      } else {
        // handle error
      }
    });
  };

  var main = function() {
    var counter = 0;
    new Lazy(fs.createReadStream('./cities_in.csv'))
        .lines
        .forEach(function(line) {
          counter++;
          setTimeout(function() {
            line = line.toString();
            console.log('Processing "' + line + '"');
            var components = line.split(/[,\t]/);
            var country = components[0];
            var region =  components[1];
            var city = components[2];
            var language = countryToLanguage[country] || undefined;
            if (!language) {
              return;
            }
            var wikipediaSearchUrl =
                'http://' + language + '.wikipedia.org/w/api.php' +
                '?action=query' +
                '&list=search' +
                '&srprop=' + // empty
                '&srredirects=false' +
                '&srlimit=1' +
                '&format=json';
            async.series({
              searchCity: function(callback) {
                var url = wikipediaSearchUrl + '&srsearch=' +
                    encodeURIComponent(city);
                searchCity(language, country, region, city, url, callback);
              },
              searchCityRegion: function(callback) {
                var url = wikipediaSearchUrl + '&srsearch=' +
                    encodeURIComponent(city + ' ' + region);
                searchCity(language, country, region, city, url, callback);
              }
            },
            function(err, results) {
              if (results.searchCity) {
                getCategories(results.searchCity);
              } else if (results.searchCityRegion) {
                getCategories(results.searchCityRegion);
              }
            });
          }, counter * 1000);
        });
  };

  var outStream = fs.createWriteStream('./cities_out.csv', {
    flags: 'w',
    encoding: 'utf8',
    mode: 0666
  });
  main();
})();