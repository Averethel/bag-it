import type { RebrickableInventoryItem } from "./rebrickable-csv";
import type { RebrickableCatalogPart } from "./rebrickable-catalog";
import { describeRebrickableColor } from "./rebrickable-csv";
import {
  scoreVisualPartDescriptorMatch,
  type VisualPartDescriptor,
} from "./visual-part-matching";

export type OcrTextBox = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type OcrTextLine = {
  pageNumber: number;
  text: string;
  confidence: number | null;
  bbox: OcrTextBox | null;
};

export type OcrTextWord = {
  pageNumber: number;
  text: string;
  confidence: number | null;
  bbox: OcrTextBox;
  visualColorRgb?: string | null;
  visualDescriptor?: VisualPartDescriptor | null;
};

export type OcrPageText = {
  pageNumber: number;
  width: number;
  height: number;
  cards?: OcrPartCardText[];
  lines: OcrTextLine[];
  words?: OcrTextWord[];
};

export type OcrPartCardText = {
  pageNumber: number;
  bbox: OcrTextBox;
  visualColorRgb?: string | null;
  visualDescriptor?: VisualPartDescriptor | null;
  lines: OcrTextLine[];
  words: OcrTextWord[];
};

export type ExtractedPartListItem = {
  id: string;
  sequence: number;
  pageNumber: number;
  quantity: number | null;
  partNumber: string | null;
  ocrPartNumber?: string | null;
  colorName: string | null;
  ocrColorName?: string | null;
  description: string | null;
  confidence: number | null;
  status: "complete" | "needs-review";
  rawText: string;
  visualColorRgb?: string | null;
  visualDescriptor?: VisualPartDescriptor | null;
  notes: string[];
  validationStatus?:
    | "not-validated"
    | "catalog-exact-match"
    | "catalog-alias-match"
    | "catalog-no-match"
    | "csv-exact-match"
    | "csv-alias-match"
    | "csv-no-match";
};

export type PartListExtractionResult = {
  items: ExtractedPartListItem[];
  pagesAnalyzed: number;
  candidatePageNumbers: number[];
  selectedPageNumbers: number[];
  warnings: string[];
  validationSummary?: PartListValidationSummary;
};

export type PartListValidationSummary = {
  source: "catalog" | "csv";
  csvRows: number;
  catalogRows: number;
  exactMatches: number;
  aliasMatches: number;
  unmatchedRows: number;
  unusedCsvRows: number;
  quantityDifferences: number;
};

export type PartListExtractionOptions = {
  catalogValidationEnabled?: boolean;
  candidateCatalogParts?: RebrickableCatalogPart[];
  catalogColorNames?: string[];
  validationInventory?: RebrickableInventoryItem[];
};

export type PartsListPageSummary = {
  pageNumber: number;
  itemCount: number;
  hasInventoryHeader: boolean;
  isLikelyPartsListPage: boolean;
};

type NormalizedLine = {
  pageNumber: number;
  pageLineIndex: number;
  text: string;
  confidence: number | null;
  bbox: OcrTextLine["bbox"];
};

type NormalizedWord = {
  pageNumber: number;
  text: string;
  confidence: number | null;
  bbox: OcrTextBox;
  visualColorRgb?: string | null;
  visualDescriptor?: VisualPartDescriptor | null;
};

type PageCandidate = {
  pageNumber: number;
  items: ExtractedPartListItem[];
  hasInventoryHeader: boolean;
};

type ColorVocabularyEntry = {
  colorName: string;
  matchName: string;
};

const partNumberSource = String.raw`(?:\d{4,7}(?:[a-z][a-z0-9]*)?|\d{3}[a-z][a-z0-9]*)`;
const partNumberPattern = new RegExp(String.raw`\b${partNumberSource}\b`, "i");
const partNumberGlobalPattern = new RegExp(
  String.raw`\b${partNumberSource}\b`,
  "gi",
);
const exactPartNumberPattern = new RegExp(
  String.raw`^${partNumberSource}$`,
  "i",
);
const inventoryHeaderPattern = /\b(parts?|inventory|elements?)\b/i;
const densePartsListCandidateItemThreshold = 4;
const exactPartNumberScore = 300;
const normalizedPartNumberScore = 260;
const catalogAliasScore = 190;
const basePartNumberAliasScore = 150;
const quantityTieBreakerScore = 0;
const strongColorEvidenceScore = 25;
const exactColorEvidenceScore = 90;
const rawExactColorEvidenceScore = 84;
const visualExactColorEvidenceScore = 82;
const fullDescriptorColorEvidenceScore = 72;
const partialDescriptorColorEvidenceScore = 44;
const genericColorFamilyEvidenceScore = 12;
const strongVisualPartEvidenceScore = 38;
const likelyPartsListPageItemThreshold = 8;
const defaultColorNames = [
  "Dark Bluish Gray",
  "Light Bluish Gray",
  "Dark Blue",
  "Dark Green",
  "Dark Red",
  "Dark Tan",
  "Light Gray",
  "Medium Azure",
  "Medium Blue",
  "Reddish Brown",
  "Sand Blue",
  "Sand Green",
  "Bright Light Orange",
  "Bright Light Yellow",
  "Trans Clear",
  "Transparent",
  "Black",
  "Blue",
  "Brown",
  "Green",
  "Gray",
  "Grey",
  "Orange",
  "Purple",
  "Red",
  "Tan",
  "White",
  "Yellow",
];

export function extractPartListFromOcrPages(
  pages: OcrPageText[],
  options: PartListExtractionOptions = {},
): PartListExtractionResult {
  const colorVocabulary = createColorVocabulary(
    options.validationInventory,
    options.catalogColorNames,
  );
  const pageCandidates = pages
    .map((page) => parsePageCandidates(page, colorVocabulary, options))
    .filter((candidate) => candidate.items.length > 0)
    .sort((left, right) => left.pageNumber - right.pageNumber);
  const candidatePageNumbers = pageCandidates.map((candidate) => candidate.pageNumber);
  const selectedPageNumbers = selectLikelyPartsListPages(pageCandidates);
  const selectedPageNumberSet = new Set(selectedPageNumbers);
  const extractedItems = pageCandidates
    .filter((candidate) => selectedPageNumberSet.has(candidate.pageNumber))
    .flatMap((candidate) => candidate.items)
    .map((item, index) => ({
      ...item,
      id: `part-list-item-${index + 1}`,
      sequence: index + 1,
    }));
  const validationResult = options.validationInventory?.length
    ? validateItemsAgainstCsvInventory(extractedItems, options.validationInventory, {
        candidateCatalogParts: options.candidateCatalogParts ?? [],
      })
    : options.catalogValidationEnabled || options.candidateCatalogParts?.length
      ? validateItemsAgainstCatalog(
          extractedItems,
          options.candidateCatalogParts ?? [],
        )
      : null;
  const items = validationResult?.items ?? extractedItems;
  const warnings: string[] = [];

  if (candidatePageNumbers.length === 0) {
    warnings.push("No part-number-like OCR rows were found.");
  } else if (selectedPageNumbers.length === 0) {
    warnings.push("No dense trailing parts-list pages were detected.");
  } else if (selectedPageNumbers.length < candidatePageNumbers.length) {
    warnings.push(
      "Only the densest trailing candidate pages were treated as the parts list.",
    );
  }

  return {
    items,
    pagesAnalyzed: pages.length,
    candidatePageNumbers,
    selectedPageNumbers,
    warnings,
    ...(validationResult ? { validationSummary: validationResult.summary } : {}),
  };
}

export function summarizePartsListPage(page: OcrPageText): PartsListPageSummary {
  const candidate = parsePageCandidates(page, createColorVocabulary(), {});

  return {
    pageNumber: candidate.pageNumber,
    itemCount: candidate.items.length,
    hasInventoryHeader: candidate.hasInventoryHeader,
    isLikelyPartsListPage:
      candidate.hasInventoryHeader ||
      candidate.items.length >= likelyPartsListPageItemThreshold,
  };
}

function parsePageCandidates(
  page: OcrPageText,
  colorVocabulary: ColorVocabularyEntry[],
  options: PartListExtractionOptions,
): PageCandidate {
  const lines = page.lines
    .map((line, pageLineIndex): NormalizedLine => ({
      pageNumber: line.pageNumber,
      pageLineIndex,
      text: normalizeOcrText(line.text),
      confidence: line.confidence,
      bbox: line.bbox,
    }))
    .filter((line) => line.text.length > 0);

  const items: ExtractedPartListItem[] = [];
  const cardItems = parseCardPageCandidates(page, colorVocabulary);
  const wordItems = parseWordPageCandidates(page, colorVocabulary);

  lines.forEach((line, index) => {
    if (!partNumberPattern.test(line.text)) {
      return;
    }

    const contextLines = collectPartRowContext(lines, index);
    items.push(
      ...parsePartListItems(
        contextLines,
        items.length + 1,
        colorVocabulary,
        page.cards ?? [],
      ),
    );
  });

  const candidateSets = [cardItems, wordItems, items];
  const baseItems = repairMissingQuantitiesFromAlternativeOcrCandidates(
    selectBestPageCandidateItems(candidateSets, options),
    candidateSets,
  );

  return {
    pageNumber: page.pageNumber,
    items: baseItems,
    hasInventoryHeader:
      lines.some((line) => inventoryHeaderPattern.test(line.text)) ||
      (page.words ?? []).some((word) => inventoryHeaderPattern.test(word.text)),
  };
}

function selectBestPageCandidateItems(
  candidateSets: ExtractedPartListItem[][],
  options: PartListExtractionOptions,
) {
  return candidateSets
    .filter((items) => items.length > 0)
    .map((items) => ({
      items,
      score: scorePageCandidateItems(items, options),
    }))
    .sort((left, right) => right.score - left.score)[0]?.items ?? [];
}

function scorePageCandidateItems(
  items: ExtractedPartListItem[],
  options: PartListExtractionOptions,
) {
  let score = scoreCandidateItems(items);

  if (options.validationInventory?.length) {
    const validation = validateItemsAgainstCsvInventory(
      items.map((item, index) => ({
        ...item,
        id: `candidate-${item.pageNumber}-${index}`,
        sequence: index + 1,
      })),
      options.validationInventory,
      { candidateCatalogParts: options.candidateCatalogParts ?? [] },
    );

    score += validation.summary.exactMatches * 24;
    score += validation.summary.aliasMatches * 20;
    score -= validation.summary.unmatchedRows * 70;
  } else if (options.candidateCatalogParts?.length) {
    const validation = validateItemsAgainstCatalog(
      items.map((item, index) => ({
        ...item,
        id: `candidate-${item.pageNumber}-${index}`,
        sequence: index + 1,
      })),
      options.candidateCatalogParts,
    );

    score += validation.summary.exactMatches * 18;
    score += validation.summary.aliasMatches * 14;
    score -= validation.summary.unmatchedRows * 40;
  }

  score -= items.filter((item) => item.quantity === null).length * 4;
  score -= items.filter((item) => item.colorName === null).length * 3;

  return score;
}

function parseCardPageCandidates(
  page: OcrPageText,
  colorVocabulary: ColorVocabularyEntry[],
) {
  return (page.cards ?? [])
    .map((card, index) => parseOcrCard(card, index + 1, colorVocabulary))
    .filter((item): item is ExtractedPartListItem => item !== null);
}

function parseOcrCard(
  card: OcrPartCardText,
  sequenceOnPage: number,
  colorVocabulary: ColorVocabularyEntry[],
): ExtractedPartListItem | null {
  const cardWords = card.words
    .map((word): NormalizedWord => ({
      pageNumber: word.pageNumber,
      text: normalizeOcrText(word.text),
      confidence: word.confidence,
      bbox: word.bbox,
      visualColorRgb: word.visualColorRgb ?? null,
      visualDescriptor: word.visualDescriptor ?? null,
    }))
    .filter((word) => word.text.length > 0)
    .sort(compareWordsTopToBottom);
  const rawText = cardWords.length
    ? cardWords.map((word) => word.text).join(" ")
    : card.lines.map((line) => normalizeOcrText(line.text)).join(" ");
  const partNumberMatch = findCardPartNumber(cardWords, rawText);
  const partNumber = partNumberMatch?.partNumber ?? null;

  if (!partNumber) {
    return null;
  }

  const quantity = partNumberMatch?.word
    ? extractQuantityFromWords(cardWords, partNumberMatch.word)
    : extractQuantity(rawText, partNumber);
  const colorName = extractColorName(rawText, colorVocabulary);
  const description = extractDescription(rawText, partNumber, colorName);
  const confidence = cardWords.length
    ? averageWordConfidence(cardWords)
    : averageConfidence(
        card.lines.map((line, pageLineIndex) => ({
          pageNumber: line.pageNumber,
          pageLineIndex,
          text: line.text,
          confidence: line.confidence,
          bbox: line.bbox,
        })),
      );
  const notes = [
    quantity === null ? "Missing or unclear quantity." : null,
    colorName === null ? "Missing or unclear color." : null,
  ].filter((note): note is string => note !== null);

  return {
    id: `page-${card.pageNumber}-card-${sequenceOnPage}`,
    sequence: sequenceOnPage,
    pageNumber: card.pageNumber,
    quantity,
    partNumber,
    colorName,
    description,
    confidence,
    status: notes.length === 0 ? "complete" : "needs-review",
    rawText,
    visualColorRgb: card.visualColorRgb ?? null,
    visualDescriptor:
      partNumberMatch?.word?.visualDescriptor ?? card.visualDescriptor ?? null,
    notes,
  };
}

function scoreCandidateItems(items: ExtractedPartListItem[]) {
  return items.reduce((score, item) => {
    const quantityScore = item.quantity !== null ? 2 : 0;
    const colorScore = item.colorName !== null ? 1 : 0;
    const descriptionScore = item.description !== null ? 1 : 0;

    return score + 1 + quantityScore + colorScore + descriptionScore;
  }, 0);
}

function repairMissingQuantitiesFromAlternativeOcrCandidates(
  selectedItems: ExtractedPartListItem[],
  candidateSets: ExtractedPartListItem[][],
) {
  const alternativeItems = candidateSets
    .flat()
    .filter((candidate) => !selectedItems.includes(candidate));

  if (alternativeItems.length === 0) {
    return selectedItems;
  }

  return selectedItems.map((item) => {
    if (item.quantity !== null || !item.partNumber) {
      return item;
    }

    const quantity = findUniqueAlternativeOcrQuantity(item, alternativeItems);

    if (quantity === null) {
      return item;
    }

    const notes = item.notes
      .filter((note) => note !== "Missing or unclear quantity.")
      .concat("Quantity recovered from alternate OCR row.");

    return {
      ...item,
      quantity,
      notes,
      status:
        item.colorName === null || item.partNumber === null
          ? ("needs-review" as const)
          : ("complete" as const),
    };
  });
}

function findUniqueAlternativeOcrQuantity(
  item: ExtractedPartListItem,
  alternativeItems: ExtractedPartListItem[],
) {
  const matchingQuantities = alternativeItems
    .filter((candidate) => isSameOcrPartCandidate(item, candidate))
    .map((candidate) => candidate.quantity)
    .filter((quantity): quantity is number => quantity !== null);
  const uniqueQuantities = [...new Set(matchingQuantities)];

  return uniqueQuantities.length === 1 ? uniqueQuantities[0] ?? null : null;
}

function isSameOcrPartCandidate(
  item: ExtractedPartListItem,
  candidate: ExtractedPartListItem,
) {
  if (!item.partNumber || !candidate.partNumber) {
    return false;
  }

  if (item.pageNumber !== candidate.pageNumber) {
    return false;
  }

  if (
    normalizePartNumberAlias(item.partNumber) !==
    normalizePartNumberAlias(candidate.partNumber)
  ) {
    return false;
  }

  if (!item.colorName || !candidate.colorName) {
    return true;
  }

  return normalizeColorName(item.colorName) === normalizeColorName(candidate.colorName);
}

function findCardPartNumber(cardWords: NormalizedWord[], rawText: string) {
  const exactPartNumberWord = cardWords.find((word) => isPartNumberWord(word.text));

  if (exactPartNumberWord) {
    return {
      partNumber: exactPartNumberWord.text.toLowerCase(),
      word: exactPartNumberWord,
    };
  }

  for (let index = 0; index < cardWords.length - 1; index += 1) {
    const currentWord = cardWords[index];
    const nextWord = cardWords[index + 1];

    if (!currentWord || !nextWord) {
      continue;
    }

    const combinedPartNumber = `${currentWord.text}${nextWord.text}`.toLowerCase();

    if (
      /^\d{3,7}$/i.test(currentWord.text) &&
      /^[a-z]{1,3}\d{0,6}$/i.test(nextWord.text) &&
      isPartNumberWord(combinedPartNumber)
    ) {
      return {
        partNumber: combinedPartNumber,
        word: currentWord,
      };
    }
  }

  const compactRawText = rawText.replace(
    /\b(\d{3,7})\s+([a-z]{1,3}\d{0,6})\b/gi,
    "$1$2",
  );
  const partNumber = compactRawText.match(partNumberPattern)?.[0].toLowerCase();

  return partNumber ? { partNumber, word: null } : null;
}

function parseWordPageCandidates(
  page: OcrPageText,
  colorVocabulary: ColorVocabularyEntry[],
) {
  const words = (page.words ?? [])
    .map((word): NormalizedWord => ({
      pageNumber: word.pageNumber,
      text: normalizeOcrText(word.text),
      confidence: word.confidence,
      bbox: word.bbox,
      visualColorRgb: word.visualColorRgb ?? null,
      visualDescriptor: word.visualDescriptor ?? null,
    }))
    .filter((word) => word.text.length > 0);

  const partNumberWords = words
    .filter((word) => isPartNumberWord(word.text))
    .sort(compareWordsTopToBottom);

  if (partNumberWords.length === 0) {
    return [];
  }

  const partNumberRows = clusterPartNumberRows(partNumberWords);
  const rowCenters = partNumberRows.map((row) => averageWordCenterY(row));

  return partNumberRows.flatMap((row, rowIndex) => {
    const sortedRow = [...row].sort((left, right) => centerX(left) - centerX(right));
    const currentRowCenter = rowCenters[rowIndex] ?? averageWordCenterY(row);
    const previousRowCenter = rowCenters[rowIndex - 1] ?? null;
    const nextRowCenter = rowCenters[rowIndex + 1] ?? null;
    const estimatedRowGap =
      nextRowCenter !== null
        ? nextRowCenter - currentRowCenter
        : previousRowCenter !== null
          ? currentRowCenter - previousRowCenter
          : page.height;
    const rowTop =
      rowIndex === 0
        ? Math.max(0, currentRowCenter - estimatedRowGap / 2)
        : ((previousRowCenter ?? currentRowCenter) + currentRowCenter) / 2;
    const rowBottom =
      rowIndex === partNumberRows.length - 1
        ? Math.min(page.height, currentRowCenter + estimatedRowGap / 2)
        : (currentRowCenter + (nextRowCenter ?? currentRowCenter)) / 2;

    return sortedRow.map((partNumberWord, columnIndex) => {
      const previousPartNumberWord = sortedRow[columnIndex - 1];
      const nextPartNumberWord = sortedRow[columnIndex + 1];
      const columnLeft = previousPartNumberWord
        ? (centerX(previousPartNumberWord) + centerX(partNumberWord)) / 2
        : 0;
      const columnRight = nextPartNumberWord
        ? (centerX(partNumberWord) + centerX(nextPartNumberWord)) / 2
        : page.width;
      const cardWords = words
        .filter((word) => {
          const wordCenterX = centerX(word);
          const wordCenterY = centerY(word);

          return (
            wordCenterX >= columnLeft &&
            wordCenterX < columnRight &&
            wordCenterY >= rowTop &&
            wordCenterY < rowBottom
          );
        })
        .sort(compareWordsTopToBottom);
      const enrichedCardWords = addNearbyQuantityWords({
        allPartNumberWords: partNumberWords,
        allWords: words,
        cardWords,
        columnLeft,
        columnRight,
        pageHeight: page.height,
        pageWidth: page.width,
        partNumberWord,
        rowBottom,
        rowTop,
      });

      return parseWordCard(
        partNumberWord,
        enrichedCardWords,
        rowIndex * sortedRow.length + columnIndex + 1,
        colorVocabulary,
        findVisualColorForPartNumberWord(page.cards ?? [], partNumberWord) ??
          partNumberWord.visualColorRgb ??
          null,
      );
    });
  });
}

function addNearbyQuantityWords({
  allPartNumberWords,
  allWords,
  cardWords,
  columnLeft,
  columnRight,
  pageHeight,
  pageWidth,
  partNumberWord,
  rowBottom,
  rowTop,
}: {
  allPartNumberWords: NormalizedWord[];
  allWords: NormalizedWord[];
  cardWords: NormalizedWord[];
  columnLeft: number;
  columnRight: number;
  pageHeight: number;
  pageWidth: number;
  partNumberWord: NormalizedWord;
  rowBottom: number;
  rowTop: number;
}) {
  if (extractQuantityFromWords(cardWords, partNumberWord) !== null) {
    return cardWords;
  }

  const columnWidth = Math.max(1, columnRight - columnLeft);
  const rowHeight = Math.max(1, rowBottom - rowTop);
  const searchBox = {
    x0: Math.max(0, columnLeft - Math.max(42, columnWidth * 0.16)),
    y0: Math.max(0, rowTop - Math.max(54, Math.min(220, rowHeight * 0.9))),
    x1: Math.min(pageWidth, columnRight + Math.max(42, columnWidth * 0.16)),
    y1: Math.min(pageHeight, rowBottom + Math.max(54, Math.min(220, rowHeight * 0.9))),
  };
  const nearbyQuantityWords = findNearestQuantityWords({
    allPartNumberWords,
    allWords,
    partNumberWord,
    searchBox,
  });

  if (nearbyQuantityWords.length === 0) {
    return cardWords;
  }

  const cardWordSet = new Set(cardWords);

  return [
    ...cardWords,
    ...nearbyQuantityWords.filter((word) => !cardWordSet.has(word)),
  ].sort(compareWordsTopToBottom);
}

function findNearestQuantityWords({
  allPartNumberWords,
  allWords,
  partNumberWord,
  searchBox,
}: {
  allPartNumberWords: NormalizedWord[];
  allWords: NormalizedWord[];
  partNumberWord: NormalizedWord;
  searchBox: OcrTextBox;
}) {
  const directQuantityCandidates = allWords
    .filter((word) => readQuantityWord(word.text) !== null)
    .filter((word) => isWordCenterInsideBox(word, searchBox))
    .filter(
      (word) =>
        nearestPartNumberWord(allPartNumberWords, word) === partNumberWord,
    )
    .map((word) => ({
      word,
      score: scoreQuantityWordDistance(word, partNumberWord),
    }))
    .sort((left, right) => left.score - right.score);

  if (directQuantityCandidates[0]) {
    return [directQuantityCandidates[0].word];
  }

  const standaloneXWords = allWords
    .filter((word) => /^x$/i.test(word.text))
    .filter((word) => isWordCenterInsideBox(word, searchBox))
    .filter(
      (word) =>
        nearestPartNumberWord(allPartNumberWords, word) === partNumberWord,
    );

  const splitQuantityCandidates = standaloneXWords
    .flatMap((xWord) => {
      const quantityWord = allWords
        .filter((word) => readSmallPositiveInteger(word.text) !== null)
        .filter((word) => isWordCenterInsideBox(word, searchBox))
        .filter((word) => Math.abs(centerY(word) - centerY(xWord)) <= 42)
        .map((word) => ({
          word,
          score:
            Math.abs(centerX(word) - centerX(xWord)) +
            Math.abs(centerY(word) - centerY(xWord)) * 2,
        }))
        .sort((left, right) => left.score - right.score)[0]?.word;

      return quantityWord
        ? [
            {
              words: [quantityWord, xWord],
              score: scoreQuantityWordDistance(xWord, partNumberWord),
            },
          ]
        : [];
    })
    .sort((left, right) => left.score - right.score);

  return splitQuantityCandidates[0]?.words ?? [];
}

function findVisualColorForPartNumberWord(
  cards: OcrPartCardText[],
  partNumberWord: NormalizedWord,
) {
  return (
    cards.find((card) => isWordCenterInsideBox(partNumberWord, card.bbox))
      ?.visualColorRgb ?? null
  );
}

function findVisualColorForContextLines(
  cards: OcrPartCardText[],
  contextLines: NormalizedLine[],
) {
  const partNumberLine = contextLines.find(
    (line) => line.bbox && partNumberPattern.test(line.text),
  );

  if (!partNumberLine?.bbox) {
    return null;
  }

  const lineCenterX = (partNumberLine.bbox.x0 + partNumberLine.bbox.x1) / 2;
  const lineCenterY = (partNumberLine.bbox.y0 + partNumberLine.bbox.y1) / 2;

  return (
    cards.find((card) => pointInBox(lineCenterX, lineCenterY, card.bbox))
      ?.visualColorRgb ?? null
  );
}

function nearestPartNumberWord(
  partNumberWords: NormalizedWord[],
  targetWord: NormalizedWord,
) {
  return partNumberWords.reduce((nearest, partNumberWord) => {
    const nearestDistance = wordDistance(nearest, targetWord);
    const candidateDistance = wordDistance(partNumberWord, targetWord);

    return candidateDistance < nearestDistance ? partNumberWord : nearest;
  });
}

function scoreQuantityWordDistance(
  quantityWord: NormalizedWord,
  partNumberWord: NormalizedWord,
) {
  return (
    Math.abs(centerX(quantityWord) - centerX(partNumberWord)) * 0.7 +
    Math.abs(centerY(quantityWord) - centerY(partNumberWord))
  );
}

function wordDistance(left: NormalizedWord, right: NormalizedWord) {
  const xDistance = centerX(left) - centerX(right);
  const yDistance = centerY(left) - centerY(right);

  return Math.sqrt(xDistance * xDistance + yDistance * yDistance);
}

function isWordCenterInsideBox(word: NormalizedWord, box: OcrTextBox) {
  const wordCenterX = centerX(word);
  const wordCenterY = centerY(word);

  return pointInBox(wordCenterX, wordCenterY, box);
}

function pointInBox(x: number, y: number, box: OcrTextBox) {
  return (
    x >= box.x0 &&
    x < box.x1 &&
    y >= box.y0 &&
    y < box.y1
  );
}

function collectPartRowContext(lines: NormalizedLine[], partNumberLineIndex: number) {
  const contextLines: NormalizedLine[] = [];
  const previousLine = lines[partNumberLineIndex - 1];

  if (
    previousLine &&
    !partNumberPattern.test(previousLine.text) &&
    isLikelyQuantityOrColorLine(previousLine.text)
  ) {
    contextLines.push(previousLine);
  }

  const partNumberLine = lines[partNumberLineIndex];

  if (!partNumberLine) {
    return contextLines;
  }

  contextLines.push(partNumberLine);

  for (
    let nextLineIndex = partNumberLineIndex + 1;
    nextLineIndex < lines.length && contextLines.length < 5;
    nextLineIndex += 1
  ) {
    const nextLine = lines[nextLineIndex];

    if (!nextLine || partNumberPattern.test(nextLine.text)) {
      break;
    }

    contextLines.push(nextLine);
  }

  return contextLines;
}

function parsePartListItems(
  contextLines: NormalizedLine[],
  sequenceOnPage: number,
  colorVocabulary: ColorVocabularyEntry[],
  cards: OcrPartCardText[] = [],
): ExtractedPartListItem[] {
  const rawText = contextLines.map((line) => line.text).join(" ");
  const partNumbers = extractPartNumbers(rawText);
  const visualColorRgb = findVisualColorForContextLines(cards, contextLines);

  if (partNumbers.length > 1) {
    return parseGroupedPartListItems(
      contextLines,
      rawText,
      partNumbers,
      sequenceOnPage,
      colorVocabulary,
      visualColorRgb,
    );
  }

  const partNumber = partNumbers[0] ?? null;
  const quantity = extractQuantity(rawText, partNumber);
  const colorName = extractColorName(rawText, colorVocabulary);
  const description = extractDescription(rawText, partNumber, colorName);
  const confidence = averageConfidence(contextLines);
  const notes = [
    quantity === null ? "Missing or unclear quantity." : null,
    partNumber === null ? "Missing or unclear part number." : null,
    colorName === null ? "Missing or unclear color." : null,
  ].filter((note): note is string => note !== null);

  if (!partNumber) {
    return [];
  }

  return [
    {
      id: `page-${contextLines[0]?.pageNumber ?? 0}-row-${sequenceOnPage}`,
      sequence: sequenceOnPage,
      pageNumber: contextLines[0]?.pageNumber ?? 0,
      quantity,
      partNumber,
      colorName,
      description,
      confidence,
      status: notes.length === 0 ? "complete" : "needs-review",
      rawText,
      visualColorRgb,
      notes,
    },
  ];
}

function parseGroupedPartListItems(
  contextLines: NormalizedLine[],
  rawText: string,
  partNumbers: string[],
  sequenceOnPage: number,
  colorVocabulary: ColorVocabularyEntry[],
  visualColorRgb: string | null,
): ExtractedPartListItem[] {
  const colorMatches = extractColorMatches(rawText, colorVocabulary);
  const confidence = averageConfidence(contextLines);
  const pageNumber = contextLines[0]?.pageNumber ?? 0;
  const partNumberMatches = Array.from(rawText.matchAll(partNumberGlobalPattern));

  return partNumbers.map((partNumber, index) => {
    const match = partNumberMatches[index];
    const previousMatch = partNumberMatches[index - 1];
    const nextMatch = partNumberMatches[index + 1];
    const localRawText =
      match?.index === undefined
        ? rawText
        : rawText
            .slice(
              previousMatch?.index === undefined
                ? 0
                : previousMatch.index + previousMatch[0].length,
              nextMatch?.index ?? rawText.length,
            )
            .trim();
    const quantity = extractQuantity(localRawText, partNumber);
    const colorName = colorMatches[index]?.colorName ?? null;
    const notes = [
      "Grouped OCR row split into individual part-number candidates.",
      quantity === null ? "Missing or unclear quantity." : null,
      colorName === null ? "Missing or unclear color." : null,
    ].filter((note): note is string => note !== null);

    return {
      id: `page-${pageNumber}-row-${sequenceOnPage + index}`,
      sequence: sequenceOnPage + index,
      pageNumber,
      quantity,
      partNumber,
      colorName,
      description: null,
      confidence,
      status: "needs-review",
      rawText,
      visualColorRgb,
      notes,
    };
  });
}

function parseWordCard(
  partNumberWord: NormalizedWord,
  cardWords: NormalizedWord[],
  sequenceOnPage: number,
  colorVocabulary: ColorVocabularyEntry[],
  visualColorRgb: string | null,
): ExtractedPartListItem {
  const rawText = cardWords.map((word) => word.text).join(" ");
  const partNumber = partNumberWord.text.toLowerCase();
  const quantity = extractQuantityFromWords(cardWords, partNumberWord);
  const colorName = extractColorName(rawText, colorVocabulary);
  const description = extractDescription(rawText, partNumber, colorName);
  const confidence = averageWordConfidence(cardWords);
  const notes = [
    quantity === null ? "Missing or unclear quantity." : null,
    colorName === null ? "Missing or unclear color." : null,
  ].filter((note): note is string => note !== null);

  return {
    id: `page-${partNumberWord.pageNumber}-word-${sequenceOnPage}`,
    sequence: sequenceOnPage,
    pageNumber: partNumberWord.pageNumber,
    quantity,
    partNumber,
    colorName,
    description,
    confidence,
    status: notes.length === 0 ? "complete" : "needs-review",
    rawText,
    visualColorRgb,
    visualDescriptor: partNumberWord.visualDescriptor ?? null,
    notes,
  };
}

function validateItemsAgainstCsvInventory(
  items: ExtractedPartListItem[],
  inventory: RebrickableInventoryItem[],
  options: { candidateCatalogParts: RebrickableCatalogPart[] },
) {
  const usedInventoryIndexes = new Set<number>();
  const candidateCatalogPartsByPartNumber = createCandidateCatalogPartLookup(
    options.candidateCatalogParts,
  );
  let exactMatches = 0;
  let aliasMatches = 0;
  let unmatchedRows = 0;
  let quantityDifferences = 0;

  const validatedItems = items.map((item, itemIndex) => {
    const match = findBestInventoryMatch(
      item,
      itemIndex,
      items,
      inventory,
      usedInventoryIndexes,
      candidateCatalogPartsByPartNumber,
    );

    if (!match) {
      unmatchedRows += 1;

      return {
        ...item,
        status: "needs-review" as const,
        validationStatus: "csv-no-match" as const,
        notes: [...item.notes, "No matching row was found in the uploaded CSV."],
      };
    }

    usedInventoryIndexes.add(match.index);

    if (match.kind === "exact") {
      exactMatches += 1;
    } else {
      aliasMatches += 1;
    }

    const quantityDiffers =
      item.quantity !== null && item.quantity !== match.inventoryItem.quantity;

    if (quantityDiffers) {
      quantityDifferences += 1;
    }

    const partNumber =
      match.kind === "alias" ? match.inventoryItem.partNumber : item.partNumber;
    const validatedPartNumber = partNumber ?? match.inventoryItem.partNumber;
    const inventoryColorName =
      match.inventoryItem.colorName ?? describeRebrickableColor(match.inventoryItem.color);
    const validatedColorName = inventoryColorName ?? item.colorName;
    const colorDiffers =
      item.colorName !== null &&
      inventoryColorName !== null &&
      normalizeColorName(item.colorName) !== normalizeColorName(inventoryColorName);
    const notes = [
      ...item.notes.filter(
        (note) =>
          note !== "Missing or unclear color.",
      ),
      match.kind === "alias" && item.partNumber
        ? `${match.inventoryItem.catalogPart ? "Rebrickable catalog" : "CSV"} suggests ${match.inventoryItem.partNumber} for OCR part ${item.partNumber}.`
        : null,
      colorDiffers
        ? `CSV suggests ${inventoryColorName} for OCR color ${item.colorName}.`
        : null,
      quantityDiffers
        ? "CSV total quantity differs; verify if this manual is only one part of a multipart MOC."
        : null,
    ].filter((note): note is string => note !== null);

    return {
      ...item,
      partNumber: validatedPartNumber,
      ...(item.partNumber !== validatedPartNumber
        ? { ocrPartNumber: item.partNumber }
        : {}),
      ...(colorDiffers ? { ocrColorName: item.colorName } : {}),
      colorName: validatedColorName,
      notes,
      status:
        item.quantity === null ? ("needs-review" as const) : ("complete" as const),
      validationStatus:
        match.kind === "exact"
          ? ("csv-exact-match" as const)
          : ("csv-alias-match" as const),
    };
  });

  return {
    items: validatedItems,
    summary: {
      source: "csv" as const,
      csvRows: inventory.length,
      catalogRows: options.candidateCatalogParts.length,
      exactMatches,
      aliasMatches,
      unmatchedRows,
      unusedCsvRows: inventory.length - usedInventoryIndexes.size,
      quantityDifferences,
    },
  };
}

function validateItemsAgainstCatalog(
  items: ExtractedPartListItem[],
  catalogParts: RebrickableCatalogPart[],
) {
  let exactMatches = 0;
  let aliasMatches = 0;
  let unmatchedRows = 0;

  const validatedItems = items.map((item) => {
    const match = findCatalogPartMatch(item, catalogParts);

    if (!match) {
      unmatchedRows += 1;

      return {
        ...item,
        status: "needs-review" as const,
        validationStatus: "catalog-no-match" as const,
        notes: [
          ...item.notes,
          "No matching part was found in the Rebrickable catalog.",
        ],
      };
    }

    if (match.kind === "exact") {
      exactMatches += 1;
    } else {
      aliasMatches += 1;
    }

    const validatedPartNumber =
      match.kind === "alias" ? match.catalogPart.partNumber : item.partNumber;
    const notes = [
      ...item.notes,
      match.kind === "alias" && item.partNumber
        ? `Rebrickable catalog suggests ${match.catalogPart.partNumber} for OCR part ${item.partNumber}.`
        : null,
    ].filter((note): note is string => note !== null);

    return {
      ...item,
      partNumber: validatedPartNumber ?? match.catalogPart.partNumber,
      ...(validatedPartNumber !== item.partNumber
        ? { ocrPartNumber: item.partNumber }
        : {}),
      description: item.description ?? match.catalogPart.name,
      notes,
      status:
        item.quantity === null || item.colorName === null
          ? ("needs-review" as const)
          : ("complete" as const),
      validationStatus:
        match.kind === "exact"
          ? ("catalog-exact-match" as const)
          : ("catalog-alias-match" as const),
    };
  });

  return {
    items: validatedItems,
    summary: {
      source: "catalog" as const,
      csvRows: 0,
      catalogRows: catalogParts.length,
      exactMatches,
      aliasMatches,
      unmatchedRows,
      unusedCsvRows: 0,
      quantityDifferences: 0,
    },
  };
}

function findCatalogPartMatch(
  item: ExtractedPartListItem,
  catalogParts: RebrickableCatalogPart[],
) {
  if (!item.partNumber) {
    return null;
  }

  const normalizedPartNumber = normalizePartNumberAlias(item.partNumber);
  const matches = catalogParts
    .flatMap((catalogPart) => {
      const match = scoreCatalogPartMatch(normalizedPartNumber, catalogPart);

      return match ? [{ ...match, catalogPart }] : [];
    })
    .sort((left, right) => right.score - left.score);
  const [bestMatch, nextMatch] = matches;

  if (!bestMatch) {
    return null;
  }

  if (
    bestMatch.kind !== "exact" &&
    nextMatch &&
    nextMatch.score === bestMatch.score
  ) {
    return null;
  }

  return bestMatch;
}

function scoreCatalogPartMatch(
  normalizedOcrPartNumber: string,
  catalogPart: RebrickableCatalogPart,
) {
  const exactCandidates = [catalogPart.partNumber, catalogPart.requestedPartNumber];

  if (
    exactCandidates.some(
      (partNumber) => normalizePartNumberAlias(partNumber) === normalizedOcrPartNumber,
    )
  ) {
    return { kind: "exact" as const, score: exactPartNumberScore };
  }

  const aliasMatch = catalogPart.aliases.find(
    (alias) => normalizePartNumberAlias(alias.partNumber) === normalizedOcrPartNumber,
  );

  if (aliasMatch) {
    return {
      kind: "alias" as const,
      score: scoreCatalogAlias(aliasMatch),
    };
  }

  const ocrBase = extractPartNumberBase(normalizedOcrPartNumber);
  const baseAliasMatch = catalogPart.aliases.find((alias) => {
    const aliasBase = extractPartNumberBase(
      normalizePartNumberAlias(alias.partNumber),
    );

    return ocrBase && aliasBase && ocrBase === aliasBase;
  });

  if (baseAliasMatch) {
    return {
      kind: "alias" as const,
      score: Math.min(scoreCatalogAlias(baseAliasMatch) - 40, basePartNumberAliasScore),
    };
  }

  return null;
}

function findBestInventoryMatch(
  item: ExtractedPartListItem,
  itemIndex: number,
  items: ExtractedPartListItem[],
  inventory: RebrickableInventoryItem[],
  usedInventoryIndexes: Set<number>,
  candidateCatalogPartsByPartNumber: Map<string, RebrickableCatalogPart>,
) {
  if (!item.partNumber) {
    return null;
  }

  const itemPartNumber = item.partNumber;
  const candidateCatalogPart = candidateCatalogPartsByPartNumber.get(
    normalizePartNumberAlias(itemPartNumber),
  );
  const matches = inventory
    .flatMap((inventoryItem, index) => {
      if (usedInventoryIndexes.has(index)) {
        return [];
      }

      const partScore =
        scorePartNumberMatch(itemPartNumber, inventoryItem) ??
        scoreNearPartNumberMatch(itemPartNumber, inventoryItem) ??
        scoreCatalogNameMatch(candidateCatalogPart, item, inventoryItem);

      if (partScore === null) {
        return [];
      }

      const quantityScore =
        item.quantity !== null && item.quantity === inventoryItem.quantity
          ? quantityTieBreakerScore
          : 0;
      const colorScore = Math.max(
        scoreColorMatch(item, inventoryItem),
        scoreContextColorMatch(items, itemIndex, inventoryItem),
      );
      const visualPartScore = scoreVisualPartMatch(item, inventoryItem);

      return [
        {
          index,
          inventoryItem,
          kind: partScore.kind,
          colorMatched: colorScore >= strongColorEvidenceScore,
          visualPartMatched: visualPartScore >= strongVisualPartEvidenceScore,
          score: partScore.score + quantityScore + colorScore + visualPartScore,
        },
      ];
    })
    .sort((left, right) => right.score - left.score);
  const rankedMatches =
    item.colorName && matches.some((match) => match.colorMatched)
      ? matches.filter((match) => match.colorMatched)
      : matches.some((match) => match.visualPartMatched)
        ? matches.filter((match) => match.visualPartMatched)
      : matches;

  for (const match of rankedMatches) {
    if (
      match.kind !== "exact" &&
      hasFutureExactPartNumberMatch(items, itemIndex, match.inventoryItem)
    ) {
      continue;
    }

    return match;
  }

  return null;
}

function createCandidateCatalogPartLookup(
  catalogParts: RebrickableCatalogPart[],
) {
  const lookup = new Map<string, RebrickableCatalogPart>();

  catalogParts.forEach((catalogPart) => {
    [catalogPart.requestedPartNumber, catalogPart.partNumber].forEach((partNumber) => {
      lookup.set(normalizePartNumberAlias(partNumber), catalogPart);
    });
  });

  catalogParts.forEach((catalogPart) => {
    catalogPart.aliases.forEach((alias) => {
      const partNumber = normalizePartNumberAlias(alias.partNumber);

      if (!lookup.has(partNumber)) {
        lookup.set(partNumber, catalogPart);
      }
    });
  });

  return lookup;
}

function hasFutureExactPartNumberMatch(
  items: ExtractedPartListItem[],
  currentItemIndex: number,
  inventoryItem: RebrickableInventoryItem,
) {
  const normalizedInventoryPartNumber = normalizePartNumberAlias(
    inventoryItem.partNumber,
  );

  return items
    .slice(currentItemIndex + 1)
    .some(
      (futureItem) =>
        futureItem.partNumber &&
        normalizePartNumberAlias(futureItem.partNumber) ===
          normalizedInventoryPartNumber,
    );
}

function scorePartNumberMatch(
  ocrPartNumber: string,
  inventoryItem: RebrickableInventoryItem,
) {
  const normalizedOcrPartNumber = normalizePartNumberAlias(ocrPartNumber);
  const normalizedInventoryPartNumber = normalizePartNumberAlias(
    inventoryItem.partNumber,
  );

  if (normalizedOcrPartNumber === normalizedInventoryPartNumber) {
    return ocrPartNumber.trim().toLowerCase() ===
      inventoryItem.partNumber.trim().toLowerCase()
      ? { kind: "exact" as const, score: exactPartNumberScore }
      : { kind: "alias" as const, score: normalizedPartNumberScore };
  }

  const catalogAliasScore = scoreCatalogAliasMatch(
    normalizedOcrPartNumber,
    inventoryItem,
  );

  if (catalogAliasScore) {
    return catalogAliasScore;
  }

  const ocrBase = extractPartNumberBase(normalizedOcrPartNumber);
  const inventoryBase = extractPartNumberBase(normalizedInventoryPartNumber);

  if (ocrBase && inventoryBase && ocrBase === inventoryBase) {
    return { kind: "alias" as const, score: basePartNumberAliasScore };
  }

  return null;
}

function scoreCatalogNameMatch(
  candidateCatalogPart: RebrickableCatalogPart | undefined,
  item: ExtractedPartListItem,
  inventoryItem: RebrickableInventoryItem,
) {
  const candidateName = candidateCatalogPart?.name;
  const inventoryName = inventoryItem.catalogPart?.name;

  if (!candidateName || !inventoryName) {
    return null;
  }

  const similarity = scorePartNameSimilarity(candidateName, inventoryName);
  const quantityScore =
    item.quantity !== null && item.quantity === inventoryItem.quantity
      ? quantityTieBreakerScore
      : 0;
  const colorScore = scoreColorMatch(item, inventoryItem);

  if (similarity < 0.62 || (quantityScore === 0 && colorScore === 0)) {
    return null;
  }

  return {
    kind: "alias" as const,
    score: Math.round(62 + similarity * 18 + quantityScore + colorScore),
  };
}

function scoreNearPartNumberMatch(
  ocrPartNumber: string,
  inventoryItem: RebrickableInventoryItem,
) {
  const normalizedOcrPartNumber = normalizePartNumberAlias(ocrPartNumber);
  const normalizedInventoryPartNumber = normalizePartNumberAlias(
    inventoryItem.partNumber,
  );

  if (
    !isNearPartNumberCandidate(
      normalizedOcrPartNumber,
      normalizedInventoryPartNumber,
    )
  ) {
    return null;
  }

  return {
    kind: "alias" as const,
    score: nearPartNumberScore(
      normalizedOcrPartNumber,
      normalizedInventoryPartNumber,
    ),
  };
}

function isNearPartNumberCandidate(leftPartNumber: string, rightPartNumber: string) {
  const leftBase = extractPartNumberBase(leftPartNumber);
  const rightBase = extractPartNumberBase(rightPartNumber);

  if (!leftBase || !rightBase || leftBase.length !== rightBase.length) {
    return false;
  }

  if (leftBase.length < 5) {
    return false;
  }

  return hammingDistance(leftBase, rightBase) === 1;
}

function nearPartNumberScore(leftPartNumber: string, rightPartNumber: string) {
  const leftSuffix = leftPartNumber.replace(/^\d+/, "");
  const rightSuffix = rightPartNumber.replace(/^\d+/, "");

  return leftSuffix === rightSuffix ? 138 : 126;
}

function hammingDistance(left: string, right: string) {
  if (left.length !== right.length) {
    return Number.POSITIVE_INFINITY;
  }

  let distance = 0;

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      distance += 1;
    }
  }

  return distance;
}

function scoreCatalogAliasMatch(
  normalizedOcrPartNumber: string,
  inventoryItem: RebrickableInventoryItem,
) {
  const catalogPart = inventoryItem.catalogPart;

  if (!catalogPart) {
    return null;
  }

  const candidates = [
    {
      partNumber: catalogPart.partNumber,
      score: catalogAliasScore,
    },
    ...catalogPart.aliases.map((alias) => ({
      partNumber: alias.partNumber,
      score: scoreCatalogAlias(alias),
    })),
  ];

  const exactAlias = candidates.find(
    (candidate) =>
      normalizePartNumberAlias(candidate.partNumber) === normalizedOcrPartNumber,
  );

  if (exactAlias) {
    return {
      kind: "alias" as const,
      score: exactAlias.score,
    };
  }

  const ocrBase = extractPartNumberBase(normalizedOcrPartNumber);
  const baseAlias = candidates.find((candidate) => {
    const candidateBase = extractPartNumberBase(
      normalizePartNumberAlias(candidate.partNumber),
    );

    return ocrBase && candidateBase && ocrBase === candidateBase;
  });

  return baseAlias
    ? {
        kind: "alias" as const,
        score: Math.min(baseAlias.score - 40, basePartNumberAliasScore),
      }
    : null;
}

function scoreCatalogAlias(alias: { kind: string; source: string }) {
  if (alias.kind === "canonical") {
    return 200;
  }

  if (alias.kind === "relationship" && ["A", "M"].includes(alias.source)) {
    return 190;
  }

  if (alias.kind === "print") {
    return 184;
  }

  if (alias.kind === "relationship") {
    return 176;
  }

  return 170;
}

function scoreColorMatch(
  item: ExtractedPartListItem,
  inventoryItem: RebrickableInventoryItem,
) {
  const inventoryColorName =
    inventoryItem.colorName ?? describeRebrickableColor(inventoryItem.color);

  if (!inventoryColorName) {
    return 0;
  }

  const selectedColorScore = item.colorName
    ? scoreColorNameEvidence(item.colorName, inventoryColorName)
    : 0;
  const rawColorScore = scoreRawTextColorEvidence(
    item.rawText,
    inventoryColorName,
    item.partNumber,
  );
  const visualColorScore = scoreVisualColorEvidence(
    item.visualColorRgb ?? null,
    inventoryItem.colorRgb ?? null,
  );

  return Math.max(selectedColorScore, rawColorScore, visualColorScore);
}

function scoreColorNameEvidence(candidateColorName: string, inventoryColorName: string) {
  if (normalizeColorName(candidateColorName) === normalizeColorName(inventoryColorName)) {
    return exactColorEvidenceScore;
  }

  return scoreColorTokenEvidence(candidateColorName, inventoryColorName);
}

function scoreRawTextColorEvidence(
  rawText: string,
  inventoryColorName: string,
  partNumber: string | null,
) {
  const positionedScore = scorePositionedRawColorEvidence(
    rawText,
    inventoryColorName,
    partNumber,
  );

  if (positionedScore > 0) {
    return positionedScore;
  }

  const hasExactPhrase = createColorNameVariants(inventoryColorName).some(
    (variant) => createColorMatchPattern(variant).test(rawText),
  );

  if (hasExactPhrase) {
    return rawExactColorEvidenceScore;
  }

  return scoreColorTokenEvidence(rawText, inventoryColorName);
}

function scorePositionedRawColorEvidence(
  rawText: string,
  inventoryColorName: string,
  partNumber: string | null,
) {
  if (!partNumber) {
    return 0;
  }

  const partNumberMatch = rawText.match(
    new RegExp(`\\b${escapeRegExp(partNumber)}\\b`, "i"),
  );

  if (partNumberMatch?.index === undefined) {
    return 0;
  }

  const partNumberIndex = partNumberMatch.index;
  const partNumberEnd = partNumberIndex + partNumberMatch[0].length;
  const colorMatches = createColorNameVariants(inventoryColorName).flatMap(
    (variant) =>
      Array.from(rawText.matchAll(createColorMatchPattern(variant))).map(
        (match) => ({
          index: match.index ?? Number.MAX_SAFE_INTEGER,
          length: match[0].length,
        }),
      ),
  );

  if (colorMatches.length === 0) {
    return 0;
  }

  const bestAfterPartScore = colorMatches
    .filter((match) => match.index >= partNumberEnd)
    .map((match) =>
      Math.max(94, 118 - Math.floor((match.index - partNumberEnd) / 2)),
    )
    .sort((left, right) => right - left)[0];

  if (bestAfterPartScore !== undefined) {
    return bestAfterPartScore;
  }

  return colorMatches
    .filter((match) => match.index + match.length <= partNumberIndex)
    .map((match) =>
      Math.max(
        rawExactColorEvidenceScore,
        90 - Math.floor((partNumberIndex - (match.index + match.length)) / 3),
      ),
    )
    .sort((left, right) => right - left)[0] ?? 0;
}

function scoreVisualColorEvidence(
  visualColorRgb: string | null,
  inventoryColorRgb: string | null,
) {
  const visualColor = parseRgbHex(visualColorRgb);
  const inventoryColor = parseRgbHex(inventoryColorRgb);

  if (!visualColor || !inventoryColor) {
    return 0;
  }

  const distance = colorDistance(visualColor, inventoryColor);

  if (distance <= 32) {
    return visualExactColorEvidenceScore;
  }

  if (distance <= 58) {
    return 68;
  }

  if (distance <= 86) {
    return 40;
  }

  if (distance <= 116) {
    return 24;
  }

  return 0;
}

function scoreContextColorMatch(
  items: ExtractedPartListItem[],
  itemIndex: number,
  inventoryItem: RebrickableInventoryItem,
) {
  const inventoryColorName =
    inventoryItem.colorName ?? describeRebrickableColor(inventoryItem.color);

  if (!inventoryColorName) {
    return 0;
  }

  const previousColorScore = scoreNearbyContextColor(
    findNearbyContextColor(items, itemIndex, -1),
    inventoryColorName,
  );
  const nextColorScore = scoreNearbyContextColor(
    findNearbyContextColor(items, itemIndex, 1),
    inventoryColorName,
  );

  return Math.max(previousColorScore, nextColorScore);
}

function scoreVisualPartMatch(
  item: ExtractedPartListItem,
  inventoryItem: RebrickableInventoryItem,
) {
  const similarity = scoreVisualPartDescriptorMatch(
    item.visualDescriptor ?? null,
    inventoryItem.catalogImageDescriptor ?? null,
  );

  if (similarity >= 86) {
    return 58;
  }

  if (similarity >= 76) {
    return 42;
  }

  if (similarity >= 66) {
    return 26;
  }

  if (similarity >= 56) {
    return 14;
  }

  return 0;
}

function findNearbyContextColor(
  items: ExtractedPartListItem[],
  itemIndex: number,
  direction: -1 | 1,
) {
  for (
    let index = itemIndex + direction, distance = 1;
    index >= 0 && index < items.length && distance <= 4;
    index += direction, distance += 1
  ) {
    const colorName = items[index]?.colorName;

    if (colorName) {
      return colorName;
    }
  }

  return null;
}

function scoreNearbyContextColor(
  contextColorName: string | null,
  inventoryColorName: string,
) {
  if (!contextColorName) {
    return 0;
  }

  const colorScore = scoreColorNameEvidence(contextColorName, inventoryColorName);

  if (colorScore >= exactColorEvidenceScore) {
    return 54;
  }

  if (colorScore >= partialDescriptorColorEvidenceScore) {
    return 38;
  }

  return 0;
}

function scoreColorTokenEvidence(candidateText: string, inventoryColorName: string) {
  const candidateTokens = new Set(tokenizeColorText(candidateText));
  const inventoryTokens = tokenizeColorText(inventoryColorName);

  if (candidateTokens.size === 0 || inventoryTokens.length === 0) {
    return 0;
  }

  const descriptorTokens = inventoryTokens.filter(
    (token) => !genericColorTokens.has(token),
  );
  const genericTokens = inventoryTokens.filter((token) =>
    genericColorTokens.has(token),
  );
  const matchingDescriptors = descriptorTokens.filter((token) =>
    candidateTokens.has(token),
  ).length;
  const matchingGenericTokens = genericTokens.filter((token) =>
    candidateTokens.has(token),
  ).length;

  if (
    descriptorTokens.length > 0 &&
    matchingDescriptors === descriptorTokens.length
  ) {
    return fullDescriptorColorEvidenceScore;
  }

  if (matchingDescriptors > 0) {
    return partialDescriptorColorEvidenceScore;
  }

  if (matchingGenericTokens > 0) {
    return genericColorFamilyEvidenceScore;
  }

  return 0;
}

function normalizePartNumberAlias(partNumber: string) {
  const normalizedPartNumber = partNumber.trim().toLowerCase();
  const printedPartMatch = normalizedPartNumber.match(/^(\d+)(?:pb|pr)0*(\d+)$/);

  if (printedPartMatch) {
    return `${printedPartMatch[1]}pr${printedPartMatch[2]?.padStart(4, "0")}`;
  }

  return normalizedPartNumber;
}

function extractPartNumberBase(partNumber: string) {
  return partNumber.match(/^\d+/)?.[0] ?? null;
}

function normalizeColorName(colorName: string) {
  return colorName.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

const genericColorTokens = new Set([
  "bluish",
  "clear",
  "flat",
  "glitter",
  "glow",
  "gray",
  "grey",
  "marbled",
  "metallic",
  "milky",
  "neon",
  "opaque",
  "pearl",
  "speckle",
  "speckled",
  "trans",
  "transparent",
]);

function tokenizeColorText(text: string) {
  return text
    .toLowerCase()
    .replace(/\bliat\b/g, "light")
    .replace(/\blight\b/g, "light")
    .replace(/\bight\b/g, "light")
    .replace(/\bgra\b/g, "gray")
    .replace(/\bgrey\b/g, "gray")
    .replace(/\btransparent\b/g, "trans")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function parseRgbHex(value: string | null) {
  const normalizedValue = value?.trim().replace(/^#/, "") ?? "";

  if (!/^[0-9A-F]{6}$/i.test(normalizedValue)) {
    return null;
  }

  return {
    red: Number.parseInt(normalizedValue.slice(0, 2), 16),
    green: Number.parseInt(normalizedValue.slice(2, 4), 16),
    blue: Number.parseInt(normalizedValue.slice(4, 6), 16),
  };
}

function colorDistance(
  left: { red: number; green: number; blue: number },
  right: { red: number; green: number; blue: number },
) {
  const redDelta = left.red - right.red;
  const greenDelta = left.green - right.green;
  const blueDelta = left.blue - right.blue;

  return Math.sqrt(redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta);
}

function scorePartNameSimilarity(leftName: string, rightName: string) {
  const leftTokens = tokenizePartName(leftName);
  const rightTokens = tokenizePartName(rightName);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const intersectionSize = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;
  const unionSize = new Set([...leftTokens, ...rightTokens]).size;

  return intersectionSize / unionSize;
}

function tokenizePartName(name: string) {
  const stopWords = new Set([
    "and",
    "for",
    "the",
    "to",
    "with",
    "without",
  ]);

  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1 && !stopWords.has(token)),
  );
}

function extractQuantityFromWords(
  cardWords: NormalizedWord[],
  partNumberWord: NormalizedWord,
) {
  const quantityCandidates = cardWords
    .map((word, index) => ({
      index,
      quantity: readQuantityWord(word.text),
      word,
    }))
    .filter(
      (candidate): candidate is {
        index: number;
        quantity: number;
        word: NormalizedWord;
      } => candidate.quantity !== null,
    );

  if (quantityCandidates.length > 0) {
    return nearestWordToPartNumber(quantityCandidates, partNumberWord).quantity;
  }

  const standaloneQuantityCandidates = cardWords
    .map((word, index) => ({
      index,
      quantity: readSmallPositiveInteger(word.text),
      word,
    }))
    .filter(
      (candidate): candidate is {
        index: number;
        quantity: number;
        word: NormalizedWord;
      } =>
        candidate.quantity !== null &&
        candidate.word !== partNumberWord &&
        isLikelyStandaloneQuantityWord(
          candidate.word,
          partNumberWord,
          cardWords[candidate.index + 1] ?? null,
        ),
    );

  if (standaloneQuantityCandidates.length > 0) {
    return nearestWordToPartNumber(
      standaloneQuantityCandidates,
      partNumberWord,
    ).quantity;
  }

  const standaloneXIndex = cardWords.findIndex((word) => /^x$/i.test(word.text));

  if (standaloneXIndex >= 0) {
    const xWord = cardWords[standaloneXIndex];

    if (!xWord || !isLikelyQuantityMarkerWord(xWord, partNumberWord)) {
      return null;
    }

    const neighboringQuantity = [
      cardWords[standaloneXIndex - 1],
      cardWords[standaloneXIndex + 1],
    ]
      .filter((word): word is NormalizedWord => Boolean(word))
      .filter((word) =>
        isLikelyStandaloneQuantityWord(word, partNumberWord, null),
      )
      .map((word) => readSmallPositiveInteger(word.text))
      .find((quantity): quantity is number => quantity !== null);

    if (neighboringQuantity !== undefined) {
      return neighboringQuantity;
    }
  }

  const oneQuantitySymbol = cardWords
    .filter((word) => readLikelyOneQuantitySymbol(word.text) !== null)
    .filter((word) => isLikelyQuantitySlotWord(word, partNumberWord))
    .sort(
      (left, right) =>
        scoreQuantitySlotWord(left, partNumberWord) -
        scoreQuantitySlotWord(right, partNumberWord),
    )[0];

  if (oneQuantitySymbol) {
    return 1;
  }

  return null;
}

function isLikelyStandaloneQuantityWord(
  quantityWord: NormalizedWord,
  partNumberWord: NormalizedWord,
  nextWord: NormalizedWord | null,
) {
  const quantityText = quantityWord.text.trim();

  if (!/^\d{1,3}$/.test(quantityText)) {
    return false;
  }

  const partHeight = Math.max(1, partNumberWord.bbox.y1 - partNumberWord.bbox.y0);
  const sameRow = Math.abs(centerY(quantityWord) - centerY(partNumberWord)) <=
    Math.max(22, partHeight * 1.8);
  const abovePartNumber =
    centerY(quantityWord) < centerY(partNumberWord) &&
    centerY(partNumberWord) - centerY(quantityWord) <=
      Math.max(180, partHeight * 8) &&
    Math.abs(centerX(quantityWord) - centerX(partNumberWord)) <=
      Math.max(180, (partNumberWord.bbox.x1 - partNumberWord.bbox.x0) * 2.5);
  const afterPartNumber =
    Math.abs(centerY(quantityWord) - centerY(partNumberWord)) <=
      Math.max(22, partHeight * 1.8) &&
    quantityWord.bbox.x0 >= partNumberWord.bbox.x1 &&
    quantityWord.bbox.x0 <= partNumberWord.bbox.x1 + partHeight * 4 &&
    !nextWordLooksLikeDimensionSeparator(nextWord);

  if (!sameRow && !abovePartNumber && !afterPartNumber) {
    return false;
  }

  if (afterPartNumber) {
    return true;
  }

  return abovePartNumber
    ? true
    : quantityWord.bbox.x1 <= partNumberWord.bbox.x0 + partHeight * 3;
}

function isLikelyQuantityMarkerWord(
  markerWord: NormalizedWord,
  partNumberWord: NormalizedWord,
) {
  const partHeight = Math.max(1, partNumberWord.bbox.y1 - partNumberWord.bbox.y0);
  const sameRow = Math.abs(centerY(markerWord) - centerY(partNumberWord)) <=
    Math.max(22, partHeight * 1.8);

  if (!sameRow) {
    return false;
  }

  return markerWord.bbox.x0 <= partNumberWord.bbox.x1 + partHeight * 5;
}

function readLikelyOneQuantitySymbol(text: string) {
  const normalizedText = text
    .trim()
    .replace(/[×✕]/g, "x")
    .replace(/[^@&#.x]/gi, "")
    .toLowerCase();

  return /^(?:[.@&#]+|x)$/.test(normalizedText) ? 1 : null;
}

function nextWordLooksLikeDimensionSeparator(word: NormalizedWord | null) {
  return Boolean(word && /^[xX]$/.test(word.text.trim()));
}

function isLikelyQuantitySlotWord(
  quantityWord: NormalizedWord,
  partNumberWord: NormalizedWord,
) {
  if (quantityWord === partNumberWord) {
    return false;
  }

  const partHeight = Math.max(1, partNumberWord.bbox.y1 - partNumberWord.bbox.y0);
  const sameRowBeforePart =
    Math.abs(centerY(quantityWord) - centerY(partNumberWord)) <=
      Math.max(28, partHeight * 2.2) &&
    centerX(quantityWord) <= centerX(partNumberWord);
  const abovePart =
    centerY(quantityWord) < centerY(partNumberWord) &&
    centerY(partNumberWord) - centerY(quantityWord) <=
      Math.max(160, partHeight * 7) &&
    Math.abs(centerX(quantityWord) - centerX(partNumberWord)) <=
      Math.max(160, (partNumberWord.bbox.x1 - partNumberWord.bbox.x0) * 2.2);

  return sameRowBeforePart || abovePart;
}

function scoreQuantitySlotWord(
  quantityWord: NormalizedWord,
  partNumberWord: NormalizedWord,
) {
  return (
    Math.abs(centerX(quantityWord) - centerX(partNumberWord)) +
    Math.abs(centerY(quantityWord) - centerY(partNumberWord)) * 1.4
  );
}

function nearestWordToPartNumber<T extends { word: NormalizedWord }>(
  candidates: T[],
  partNumberWord: NormalizedWord,
) {
  return candidates.reduce((nearest, candidate) => {
    const nearestDistance = Math.abs(centerX(nearest.word) - centerX(partNumberWord));
    const candidateDistance = Math.abs(
      centerX(candidate.word) - centerX(partNumberWord),
    );

    return candidateDistance < nearestDistance ? candidate : nearest;
  });
}

function readQuantityWord(text: string) {
  const normalizedText = text
    .replace(/[×✕]/g, "x")
    .replace(/^[^\da-z|]+|[^\da-z|]+$/gi, "")
    .replace(/^[il|](?=x$)/i, "1")
    .replace(/^x[il|]$/i, "x1");
  const quantityMatch =
    normalizedText.match(/^(\d{1,4})x$/i) ??
    normalizedText.match(/^x(\d{1,4})$/i);

  return readSmallPositiveInteger(quantityMatch?.[1]);
}

function readSmallPositiveInteger(value: string | undefined) {
  const parsed = readPositiveInteger(value);

  if (parsed === null || parsed > 999) {
    return null;
  }

  return parsed;
}

function clusterPartNumberRows(partNumberWords: NormalizedWord[]) {
  const rows: NormalizedWord[][] = [];

  partNumberWords.forEach((word) => {
    const wordHeight = Math.max(1, word.bbox.y1 - word.bbox.y0);
    const matchingRow = rows.find((row) => {
      const rowCenter = averageWordCenterY(row);
      const threshold = Math.max(wordHeight * 2.5, 36);

      return Math.abs(centerY(word) - rowCenter) <= threshold;
    });

    if (matchingRow) {
      matchingRow.push(word);
      return;
    }

    rows.push([word]);
  });

  return rows;
}

function isPartNumberWord(text: string) {
  return exactPartNumberPattern.test(text);
}

function selectLikelyPartsListPages(pageCandidates: PageCandidate[]) {
  const densePages = pageCandidates.filter(
    (candidate) =>
      candidate.items.length >= densePartsListCandidateItemThreshold ||
      candidate.hasInventoryHeader,
  );

  if (densePages.length === 0) {
    return pageCandidates.map((candidate) => candidate.pageNumber);
  }

  const groups: PageCandidate[][] = [];

  densePages.forEach((candidate) => {
    const currentGroup = groups[groups.length - 1];
    const previousPage = currentGroup?.[currentGroup.length - 1];

    if (previousPage && candidate.pageNumber === previousPage.pageNumber + 1) {
      currentGroup.push(candidate);
      return;
    }

    groups.push([candidate]);
  });

  const lastGroup = groups[groups.length - 1] ?? [];
  const lastDensePage = lastGroup[lastGroup.length - 1];

  if (!lastDensePage) {
    return [];
  }

  const selectedPageNumbers = new Set(
    lastGroup.map((candidate) => candidate.pageNumber),
  );
  let trailingPageNumber = lastDensePage.pageNumber;

  pageCandidates.forEach((candidate) => {
    if (candidate.pageNumber === trailingPageNumber + 1) {
      selectedPageNumbers.add(candidate.pageNumber);
      trailingPageNumber = candidate.pageNumber;
    }
  });

  return pageCandidates
    .filter((candidate) => selectedPageNumbers.has(candidate.pageNumber))
    .map((candidate) => candidate.pageNumber);
}

function extractQuantity(rawText: string, partNumber: string | null) {
  const quantityPatterns = [
    /\b(?:qty|quantity)\s*[:#-]?\s*(\d{1,4})\b/i,
    new RegExp(
      String.raw`^\s*(\d{1,4})\s*[xX]\s+[^a-z0-9]{0,4}(?=${partNumberSource}\b)`,
      "i",
    ),
    new RegExp(
      String.raw`^\s*[xX]\s*(\d{1,4})\s+[^a-z0-9]{0,4}(?=${partNumberSource}\b)`,
      "i",
    ),
    /\b(\d{1,4})\s*(?:pcs?|pieces)\b/i,
  ];

  for (const pattern of quantityPatterns) {
    const quantity = readPositiveInteger(rawText.match(pattern)?.[1]);

    if (quantity !== null) {
      return quantity;
    }
  }

  if (partNumber) {
    const escapedPartNumber = escapeRegExp(partNumber);
    const beforePartNumber = rawText.match(
      new RegExp(`^\\s*(\\d{1,4})\\s+${escapedPartNumber}\\b`, "i"),
    );
    const afterPartNumber = rawText.match(
      new RegExp(`\\b${escapedPartNumber}\\b\\s+(\\d{1,4})\\s*[xX]\\b`, "i"),
    );
    const standaloneAfterPartNumber = rawText.match(
      new RegExp(
        `\\b${escapedPartNumber}\\b\\s+(\\d{1,3})\\b(?!\\s*[xX]\\s*\\d)`,
        "i",
      ),
    );
    const quantity =
      readPositiveInteger(beforePartNumber?.[1]) ??
      readPositiveInteger(afterPartNumber?.[1]) ??
      readPositiveInteger(standaloneAfterPartNumber?.[1]);

    if (quantity !== null) {
      return quantity;
    }
  }

  const quantityTokens = Array.from(
    rawText.matchAll(/\b(\d{1,4})\s*[xX]\b(?!\s*\d)/gi),
    (match) => readSmallPositiveInteger(match[1]),
  ).filter((quantity): quantity is number => quantity !== null);

  if (quantityTokens.length === 1) {
    return quantityTokens[0] ?? null;
  }

  const standaloneNumber = rawText
    .replace(partNumber ?? "", "")
    .match(/^\s*(\d{1,4})\b/);

  return readPositiveInteger(standaloneNumber?.[1]);
}

function createColorVocabulary(
  inventory: RebrickableInventoryItem[] = [],
  catalogColorNames: string[] = [],
) {
  const colorNames = new Set(defaultColorNames);

  catalogColorNames.forEach((colorName) => {
    if (colorName.trim()) {
      colorNames.add(colorName);
    }
  });

  inventory.forEach((inventoryItem) => {
    const inventoryColorName =
      inventoryItem.colorName ?? describeRebrickableColor(inventoryItem.color);

    if (inventoryColorName) {
      colorNames.add(inventoryColorName);
    }
  });

  const entries = [...colorNames].flatMap((colorName) =>
    createColorNameVariants(colorName).map((matchName) => ({
      colorName,
      matchName,
    })),
  );
  const seenMatchNames = new Set<string>();

  return entries
    .filter((entry) => {
      const normalizedMatchName = normalizeColorName(entry.matchName);

      if (!normalizedMatchName || seenMatchNames.has(normalizedMatchName)) {
        return false;
      }

      seenMatchNames.add(normalizedMatchName);
      return true;
    })
    .sort((left, right) => right.matchName.length - left.matchName.length);
}

function createColorNameVariants(colorName: string) {
  const variants = new Set<string>();
  const normalizedColorName = colorName.trim();

  if (!normalizedColorName) {
    return [];
  }

  variants.add(normalizedColorName);
  variants.add(normalizedColorName.replace(/-/g, " "));
  variants.add(normalizedColorName.replace(/\s+/g, "-"));

  [...variants].forEach((variant) => {
    if (/\bgray\b/i.test(variant)) {
      variants.add(variant.replace(/\bgray\b/gi, "Grey"));
    }

    if (/\bgrey\b/i.test(variant)) {
      variants.add(variant.replace(/\bgrey\b/gi, "Gray"));
    }

    if (/^trans[-\s]/i.test(variant)) {
      variants.add(variant.replace(/^trans[-\s]/i, "Transparent "));
    }
  });

  return [...variants];
}

function extractColorName(
  rawText: string,
  colorVocabulary: ColorVocabularyEntry[] = createColorVocabulary(),
) {
  return extractColorMatches(rawText, colorVocabulary)[0]?.colorName ?? null;
}

function extractColorMatches(
  rawText: string,
  colorVocabulary: ColorVocabularyEntry[] = createColorVocabulary(),
) {
  return colorVocabulary
    .flatMap((colorName) =>
      Array.from(
        rawText.matchAll(createColorMatchPattern(colorName.matchName)),
      ).map((match) => ({
        colorName: colorName.colorName,
        matchName: colorName.matchName,
        index: match.index ?? Number.MAX_SAFE_INTEGER,
      })),
    )
    .sort((left, right) => left.index - right.index)
    .filter(
      (match, index, matches) =>
        !matches
          .slice(0, index)
          .some(
            (previousMatch) =>
              previousMatch.index <= match.index &&
              previousMatch.index + previousMatch.matchName.length >=
                match.index + match.matchName.length,
          ),
    );
}

function createColorMatchPattern(colorName: string) {
  const words = colorName
    .trim()
    .split(/[-\s]+/)
    .map(escapeRegExp)
    .map((word) => (word.toLowerCase() === "gray" ? "(?:gray|grey)" : word))
    .map((word) => (word.toLowerCase() === "grey" ? "(?:gray|grey)" : word));

  return new RegExp(`\\b${words.join("[-\\s]+")}\\b`, "gi");
}

function extractDescription(
  rawText: string,
  partNumber: string | null,
  colorName: string | null,
) {
  let description = rawText
    .replace(/\b(?:qty|quantity)\s*[:#-]?\s*\d{1,4}\b/gi, " ")
    .replace(/\b\d{1,4}[xX]\b/g, " ")
    .replace(
      new RegExp(String.raw`^\s*\d{1,4}\s*[xX]\s+(?=${partNumberSource}\b)`, "i"),
      " ",
    )
    .replace(
      new RegExp(String.raw`^\s*[xX]\s*\d{1,4}\s+(?=${partNumberSource}\b)`, "i"),
      " ",
    )
    .replace(/\b\d{1,4}\s*(?:pcs?|pieces)\b/gi, " ");

  if (partNumber) {
    description = description.replace(
      new RegExp(`\\b${escapeRegExp(partNumber)}\\b`, "gi"),
      " ",
    );
  }

  if (colorName) {
    description = description.replace(
      new RegExp(`\\b${escapeRegExp(colorName)}\\b`, "gi"),
      " ",
    );
  }

  description = description
    .replace(/\b(?:part|item|element|color|colour)\b\s*[:#-]?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  description = stripLeadingOcrNoise(description);

  return description.length > 0 ? description : null;
}

function stripLeadingOcrNoise(description: string) {
  const tokens = description.split(" ");

  while (
    tokens.length > 1 &&
    (/^[^a-z0-9]+$/i.test(tokens[0] ?? "") ||
      /^[a-z]{1,2}$/i.test(tokens[0] ?? "") ||
      /^\d{1,2}$/.test(tokens[0] ?? ""))
  ) {
    tokens.shift();
  }

  return tokens.join(" ");
}

function isLikelyQuantityOrColorLine(text: string) {
  return (
    /^\s*(?:qty|quantity)?\s*[:#-]?\s*\d{1,4}\s*(?:x|pcs?|pieces)?\s*$/i.test(
      text,
    ) || extractColorName(text) !== null
  );
}

function averageConfidence(lines: NormalizedLine[]) {
  const confidenceValues = lines
    .map((line) => line.confidence)
    .filter((confidence): confidence is number => confidence !== null);

  if (confidenceValues.length === 0) {
    return null;
  }

  return (
    confidenceValues.reduce((total, confidence) => total + confidence, 0) /
    confidenceValues.length
  );
}

function averageWordConfidence(words: NormalizedWord[]) {
  const confidenceValues = words
    .map((word) => word.confidence)
    .filter((confidence): confidence is number => confidence !== null);

  if (confidenceValues.length === 0) {
    return null;
  }

  return (
    confidenceValues.reduce((total, confidence) => total + confidence, 0) /
    confidenceValues.length
  );
}

function normalizeOcrText(text: string) {
  return text
    .replace(/[\u00d7\u2715]/g, "x")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPartNumbers(rawText: string) {
  return Array.from(rawText.matchAll(partNumberGlobalPattern), (match) =>
    match[0].toLowerCase(),
  );
}

function readPositiveInteger(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function centerX(word: NormalizedWord) {
  return (word.bbox.x0 + word.bbox.x1) / 2;
}

function centerY(word: NormalizedWord) {
  return (word.bbox.y0 + word.bbox.y1) / 2;
}

function averageWordCenterY(words: NormalizedWord[]) {
  return words.reduce((total, word) => total + centerY(word), 0) / words.length;
}

function compareWordsTopToBottom(left: NormalizedWord, right: NormalizedWord) {
  if (Math.abs(left.bbox.y0 - right.bbox.y0) > 12) {
    return left.bbox.y0 - right.bbox.y0;
  }

  return left.bbox.x0 - right.bbox.x0;
}
