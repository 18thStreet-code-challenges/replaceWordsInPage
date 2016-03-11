var FrequentWordsModule,
    ArticlePageModule,
    WordCountModule,
    ReduceWordsModule,
    UtilsModule;

$(document).ready(function () {
    var excludedWords,
        paragraphs,
        wordHash,
        maxWords = 25,
        paragraphsInsertSelector = '#container',
        wikiWordPredicates = [                   // Word restrictions expressed as rules
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
            deferred.resolve();
        });
    }

    function getArticle(deferred) {
        ArticlePageModule.getArticle().complete(function () {
            deferred.resolve();
        });
    }

    // getArticle() and getFrequentWords() will run in parallel
    $.when($.Deferred(getArticle), $.Deferred(getFrequentWords)).then(function () {
        excludedWords = FrequentWordsModule.getWords();
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
                throw 'failed to get Wikipedia word list';
            });
    }

    function wikiWordsCallback(data) {
        var $content,
            tokens;

        $content = $(UtilsModule.parseWikiData(data));

        tokens = $content.find('.wikitable tr td:nth-of-type(2)');

        words = $.map(tokens, function (record) {
            var token = $(record).text();
            return token ? token : null;
        });

        data = null;     // won't need any more
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

    function getArticle() {
        return $.getJSON(
            'https://en.wikipedia.org/w/api.php?action=parse&format=json&callback=?',
            {page: 'Programming language', prop: 'text', uselang: 'en'}
        )
            .done(function (data) {
                wikiArticleCallback(data);
                data = null;     // won't need any more
            })
            .fail(function () {
                throw 'failed to get Wikipedia article';
            });
    }

    function wikiArticleCallback(data) {
        var $wrappedContent = $('<div>' + UtilsModule.parseWikiData(data) + '</div>')

        paragraphs = $.map($wrappedContent.find("p"), function (record) {

            // Requirements showed that linked items must show as links in the output.
            // Add custom syntax for marking off an text sequence as a link.  Will undo later.
            var line = $(record).html().replace(/(<a.*?>)(.*?)(<\/a>)/gi, "[lInK]$2[eNdLiNk]");

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
                    okToken = UtilsModule.isAllowable(token, predicates);

                if (!okToken) {
                    //Disallowed word, skip this word
                    return true;
                }
                if (sanitizedToken in wordHash) {
                    wordHash[sanitizedToken] += 1;
                } else {
                    wordHash[sanitizedToken] = 1;
                }
            });
        });

        excludedWords = null;      // won't need any more

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
        // Convert hashmap to temporary array of objects for sorting
        for (key in wordHash) {
            if (wordHash.hasOwnProperty(key)) {
                wordArray.push({'token': key, 'count': wordHash[key]});
            }
        }
        // Sort objects descending
        wordArray.sort(function (word1, word2) {
            return word2.count - word1.count;
        });

        // Reconvert back to hashmap, but only with top maxCount items
        maxCount = wordArray.length < maxWords ? wordArray.length : maxWords;
        for (i = 0; i < maxCount; i++) {
            newWordHash[wordArray[i].token] = wordArray[i].count;
        }

        wordHash = null;     // Won't need any more
    }

    function substituteWordsInParagraphs(paragraphs) {
        var key,
            workingParagraph,
            title = $('.title').html();

        $.each(paragraphs, function (idx, paragraph) {

            workingParagraph = paragraph;

            for (key in newWordHash) {
                if (newWordHash.hasOwnProperty(key)) {
                    var re = new RegExp('\\b' + key + '\\b', 'gi');  // whole words only
                    workingParagraph = workingParagraph.replace(re, '' + newWordHash[key]);

                    // Fix the title while we're at it.
                    title = title.replace(re, newWordHash[key]);
                }
            }
            newParagraphs.push(workingParagraph);
            $('.title').html(title);
        });

        paragraphs = null;   // won't need any more
        newWordHash = null;  // won't need any more
    }

    function modifyPage(selector) {
        $.each(newParagraphs, function (idx, paragraph) {

            // Undo our custom link markers and with real html links
            var line = paragraph.replace(/(\[lInK])(.*?)(\[eNdLiNk])/g, "<a href='#'>$2</a>");
            $(selector).append($('<p></p>').html(line));
        });

        newParagraphs = null;      // won't need any more
    }

    return {
        wordFilter: wordFilter,
        substituteWordsInParagraphs: substituteWordsInParagraphs,
        modifyPage: modifyPage
    };

})();

UtilsModule = (function () {

    // Returns true if all tests in the predicates array of functions pass
    function isAllowable(token, predicates) {
        var okToken = true,
            i;

        for (i = 0; i < predicates.length; i++) {
            okToken = okToken && predicates[i](token);
        }
        return okToken;
    }

    // Get to the data we want, and eliminate the image links (because failed attempts to
    // retrieve the images fill the console with ugly errors)
    function parseWikiData(data) {
        return data.parse.text['*'].replace(/<img\b[^>]*>/ig, '');
    }

    return {
        isAllowable: isAllowable,
        parseWikiData: parseWikiData
    };

})();