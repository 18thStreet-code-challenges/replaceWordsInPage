var FrequentWordsModule,
    ArticlePageModule,
    WordCountModule,
    ReduceWordsModule,
    TokenRestrictionsModule;

$(document).ready(function () {
    var excludedWords,
        paragraphs,
        wordHash,
        maxWords = 25,
        paragraphsInsertSelector = '#container',
        wikiWordPredicates = [
            function (token) {
                // Reject particular words
                return $.inArray(token.toLowerCase(), ['are', 'is', 'where', 'was']) == -1;
            },
            function (token) {
                return token.length > 0;         // Reject empty strings
            },
            function (token) {
                return isNaN(parseInt(token));   // reject integers
            },
            function (token) {
                return token.length > 1;         // reject single letters
            }
        ];

    function getFrequentWords(deferred) {
        FrequentWordsModule.getList().complete(function () {
            //console.log('1 complete');
            deferred.resolve();
        });
    }

    function getArticle(deferred) {
        ArticlePageModule.getArticle().complete(function () {
            //console.log('2 complete');
            deferred.resolve();
        });
    }

    // getArticle() and getFrequentWords() will run in parallel
    $.when($.Deferred(getArticle), $.Deferred(getFrequentWords)).then(function () {
        //console.log("both are done!");
        excludedWords = FrequentWordsModule.getWords();
        //console.log('excludedWords = ', excludedWords);
        paragraphs = ArticlePageModule.getParagraphs();
        wordHash = WordCountModule.tally(paragraphs, excludedWords, wikiWordPredicates);
        ReduceWordsModule.wordFilter(wordHash, maxWords);
        ReduceWordsModule.substituteWordsInParagraphs(paragraphs);
        ReduceWordsModule.modifyPage(paragraphsInsertSelector);
    });
});

FrequentWordsModule = (function () {
    var words = [];

    function getList() {
        return $.getJSON(
            "https://en.wikipedia.org/w/api.php?action=parse&format=json&callback=?",
            {page: "Most common words in English", prop: "text"}
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

ArticlePageModule = (function () {
    var paragraphs = [];

    function getArticle(predicates) {
        return $.getJSON(
            'https://en.wikipedia.org/w/api.php?action=parse&format=json&callback=?',
            {page: 'Programming language', prop: 'text', uselang: 'en'}
        )
            .done(function(data) {
                wikiArticleCallback(data, predicates);
            })
            .fail(function () {
                console.log('failed to get Wikipedia article');
            });
    }

    function wikiArticleCallback(data, predicates) {
        //console.log('article data = ', data);
        var wrappedContent = $('<div>' + data.parse.text['*'] + '</div>');
        paragraphs = $.map($(wrappedContent).find("p"), function (record) {
            var line = $(record).text().trim();
            return line ? line : null;
        });
    }

    function getParagraphs() {
        return paragraphs;
    }

    return {
        getArticle: getArticle,
        getParagraphs: getParagraphs
    };
})();

WordCountModule = (function () {
    var wordHash = {};

    function tally(paragraphs, excludedWords, predicates) {
        predicates.push(function (token) {
            return $.inArray(token.toLowerCase(), excludedWords) == -1;
        });
        $.each(paragraphs, function (idx, paragraph) {
            var words = paragraph.split(' ');
            $.each(words, function (jdx, word) {
                var token = word.trim(),
                    sanitizedToken = token.replace(/[^a-zA-Z-_]/g, ''),
                    okToken = TokenRestrictionsModule.areRequirementsMet(token, predicates);

                if (!okToken) {
                    // console.log('[' + sanitizedToken + '] is not an ok token');
                    return true;
                }
                if (token != sanitizedToken) {
                    //console.log('word [' + token + '] was sanitized to [' + sanitizedToken + ']');
                }
                if (sanitizedToken in wordHash) {
                    //console.log('add existing');
                    wordHash[sanitizedToken] += 1;
                } else {
                    //console.log('add new');
                    wordHash[sanitizedToken] = 1;
                }
            });
        });
        //console.log(wordHash);
        return wordHash;
    }

    return {
        tally: tally
    }
})();

ReduceWordsModule = (function () {
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
        //console.log('wordArray = ' , wordArray);
        wordArray.sort(function (word1, word2) {
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

        $.each(paragraphs, function (idx, paragraph) {
            workingParagraph = paragraph;
            for (key in newWordHash) {
                if (newWordHash.hasOwnProperty(key)) {
                    var re = new RegExp('\\b' + key + '\\b','gi');
                    workingParagraph = workingParagraph.replace(re, '' + newWordHash[key]);
                }
            }
            newParagraphs.push(workingParagraph);
        });
        //console.log('newParagraphs are: ', newParagraphs);
    }

    function modifyPage(selector) {
        $.each(newParagraphs, function (idx, paragraph) {
            $(selector).append($('<p></p>').html(paragraph));
        });
    }

    return {
        wordFilter: wordFilter,
        substituteWordsInParagraphs: substituteWordsInParagraphs,
        modifyPage: modifyPage
    };

})();

TokenRestrictionsModule = (function () {
    function areRequirementsMet(token, predicates) {
        var okToken = true,
            i;

        for (i = 0; i < predicates.length; i++) {
            okToken = okToken && predicates[i](token);
        }

        return okToken;
    }

    return {
        areRequirementsMet: areRequirementsMet
    };

})();