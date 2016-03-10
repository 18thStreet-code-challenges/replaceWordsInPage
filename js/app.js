$(document).ready(function () {
    var excludedWords,
        paragraphs,
        wordHash,
        maxWords = 25;

    searchListModule.getList().complete(function () {
        //console.log('1 complete');
        excludedWords = searchListModule.getWords();
        //console.log('excludedWords = ', excludedWords);
        articlePageModule.getArticle().complete(function() {
            //console.log('2 complete');
            paragraphs = articlePageModule.getParagraphs();
            wordHash = wordCountModule.tally(paragraphs, excludedWords);
            reduceWordsModule.wordFilter(wordHash, maxWords);
            reduceWordsModule.substituteWordsInParagraphs(paragraphs);
            reduceWordsModule.modifyPage('#container');
        });
    });
});

// check out later
// https://gist.github.com/sergio-fry/3917217

var searchListModule = (function () {
    var words = [];

    function getList() {
        return $.getJSON(
            "https://en.wikipedia.org/w/api.php?action=parse&format=json&callback=?",
            {
                page: "Most common words in English",
                prop: "text"
            }
        )
        .done(wikiWordsCallback)
        .fail(function () {
            console.log('failed to get Wikipedia word list');
        });
    }

    function wikiWordsCallback(data) {
        var $content = $(data.parse.text['*']),
            tokens = $content.find('.wikitable tr td:nth-of-type(2)');

        words = $.map(tokens, function (record) {
            var token = $(record).text();
            return token ? token : null;
        });
        //console.log('words = ', words);
    }

    function getWords() {
        return words;
    }

    return {
        getList: getList,
        getWords: getWords
    };
})();

var articlePageModule = (function () {
    var paragraphs = [];

    function getArticle() {
        return $.getJSON(
            'https://en.wikipedia.org/w/api.php?action=parse&format=json&callback=?',
            {page: 'Programming language', prop:'text', uselang:'en'}

        )
            .done(wikiArticleCallback)
            .fail(function () {
                console.log('failed to get Wikipedia article');
            });
    }

    function wikiArticleCallback(data) {
        //console.log('article data = ', data);
        var wrappedContent = $('<div>' + data.parse.text['*'] + '</div>');
        paragraphs = $.map($(wrappedContent).find("p"), function(record) {
            var token = $(record).text().trim(),
                okToken = true,
                i;

            for (i = 0; i < frequentWordPredicates.length; i++) {
                okToken = okToken && frequentWordPredicates[i](token);
            }
            return okToken ? token : null;
        });
    }

    function getParagraphs() {
        return paragraphs;
    }

    var frequentWordPredicates = [
        function (token) {
            return $.inArray(token.toLowerCase(), ['are', 'is', 'where', 'was']) == -1;
        }
    ];

    return {
        getArticle: getArticle,
        getParagraphs: getParagraphs
    };
})();

var wordCountModule = (function() {
    var wordHash = {};
    function tally(paragraphs, excludedWords) {
        wikiWordPredicates.push(function(token) {
            return $.inArray(token.toLowerCase(), excludedWords) == -1;
        });
        $.each(paragraphs, function(idx, paragraph) {
            var words = paragraph.split(' ');
            $.each(words, function(jdx, word) {
                var token = word.trim(),
                    okToken = true,
                    i;

                var sanitizedToken = token.replace(/[^a-zA-Z-_]/g, '');
                for (i = 0; i < wikiWordPredicates.length; i++) {
                    okToken = okToken && wikiWordPredicates[i](sanitizedToken);
                }
                if (!okToken) {
                    // console.log('[' + sanitizedToken + '] is not an ok token');
                    return true;
                }
                if (token != sanitizedToken) {
                    //console.log('word [' + token + '] was sanitized to [' + sanitizedToken + ']');
                }
                if (!(sanitizedToken in wordHash)) {
                    //console.log('add new');
                    wordHash[sanitizedToken] = 1;
                } else {
                    //console.log('add existing');
                    wordHash[sanitizedToken] += 1;
                }
            });
        });
        //console.log(wordHash);
        return wordHash;
    }

    var wikiWordPredicates = [
        function (token) {
            return token.length > 0;
        },
        function (token) {
            //console.log('token is [' + token + ']; isNaN(parseInt(token) = ' + isNaN(parseInt(token)));
            return isNaN(parseInt(token));
        },
        function (token) {
            return token.length > 1;
        }
    ];

    return {
        tally: tally
    }
})();

var reduceWordsModule = (function() {
    var wordArray = [],
        newWordHash = {},
        i,
        maxCount,
        newParagraphs = [];

    function wordFilter(wordHash, maxWords) {
        for (key in wordHash) {
            if (wordHash.hasOwnProperty(key)) {
                wordArray.push({'token': key, 'count': wordHash[key]});
            }
        }
        console.log('wordArray = ' , wordArray);
        wordArray.sort(function(word1, word2) {
            return word2.count - word1.count;
        });
        //console.log('wordArray after sorting = ' , wordArray);

        maxCount = wordArray.length < maxWords ? wordArray.length : maxWords;
        for (i = 0; i < maxCount; i++) {
            newWordHash[wordArray[i].token] = wordArray[i].count;
        }
        //console.log('newWordHash is ', newWordHash);
    }

    function substituteWordsInParagraphs(paragraphs) {
        var key,
            workingParagraph;

        $.each(paragraphs, function(idx, paragraph) {
            workingParagraph = paragraph;
            for (key in newWordHash) {
                if (newWordHash.hasOwnProperty(key)) {
                    workingParagraph = workingParagraph.replace(key, '' + newWordHash[key]);
                }
            }
            newParagraphs.push(workingParagraph);
        });
        //console.log('newParagraphs are: ', newParagraphs);
    }

    function modifyPage(selector) {
        $.each(newParagraphs, function(idx, paragraph) {
            $(selector).append($('<p></p>').html(paragraph));
        });
    }

    return {
        wordFilter: wordFilter,
        substituteWordsInParagraphs: substituteWordsInParagraphs,
        modifyPage: modifyPage
    };

})();