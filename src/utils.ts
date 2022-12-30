import { groupBy } from 'lodash';
import { CartesianProduct, PowerSet } from 'js-combinatorics';
import {
  ASCII_CHARACTERS_BY_ASCII_HOMOGLYPH,
  ASCII_CHARACTER_BY_CYRILLIC_HOMOGLYPH,
  ASCII_CHARACTER_BY_UNICODE_HOMOGLYPH,
  INVISIBLE_UNICODE_CHARACTERS,
} from './constants';
import { NormalizationConfig } from './types';

export function getNormalizedNameVariants(name: string, config: NormalizationConfig): string[] {
  const nameChars = Array.from(name.toLowerCase());
  const nameVariants = new Set<string>();

  // remap cyrillic glyphs with their ASCII representation
  nameChars.forEach((char, i) => {
    const normalizedChar = ASCII_CHARACTER_BY_CYRILLIC_HOMOGLYPH[char];
    if (normalizedChar) {
      nameChars.splice(i, 1, normalizedChar);
    }
  });

  // remap UNICODE glyphs with their ASCII representation
  nameChars.forEach((char, i) => {
    const normalizedChar = ASCII_CHARACTER_BY_UNICODE_HOMOGLYPH[char];
    if (normalizedChar) {
      nameChars.splice(i, 1, normalizedChar);
    }
  });

  // https://stackoverflow.com/a/71459391
  nameChars.forEach((char, i) => {
    // remove separators
    char = char.replace(/\p{Separator}/gu, '');
    // remove control, unassigned, format characters etc
    char = char.replace(/\p{Other}/gu, '');
    // special characters
    char = INVISIBLE_UNICODE_CHARACTERS.has(char) ? '' : char;
    nameChars.splice(i, 1, char);
  });

  // combine normalized name (char[] -> string)
  const normalizedName = nameChars.join('');
  // add normalized name to collection
  nameVariants.add(normalizedName);

  const asciiLength = normalizedName.match(/([ -~]+)/g)?.[0].length || 0;
  // return if name length is short enough for remapping of ASCII homoglyphs (high risk of False Positive)
  if (
    asciiLength < config.minASCIICharactersNumber ||
    asciiLength > config.maxASCIICharactersNumber
  ) {
    return [...nameVariants].filter((n) => n.length > 0 && n !== name);
  }

  // remap ASCII homoglyphs

  // example structure: [ '1|1', 'i|3', 'ik|3', 'n|5', 'nn|5'],
  // some homoglyphs may have the same position
  const potentialHomoglyphs: { homoglyph: string; position: number; places: number }[] = [];
  for (let i = 0; i < nameChars.length; i++) {
    const char = nameChars[i];
    if (ASCII_CHARACTERS_BY_ASCII_HOMOGLYPH[char]) {
      potentialHomoglyphs.push({ homoglyph: char, position: i, places: 1 });
    }
    if (i + 1 < nameChars.length) {
      const char2 = nameChars[i] + nameChars[i + 1];
      if (ASCII_CHARACTERS_BY_ASCII_HOMOGLYPH[char2]) {
        potentialHomoglyphs.push({ homoglyph: char2, position: i, places: 2 });
      }
    }
  }

  // create all possible combination of glyphs
  // https://github.com/dankogai/js-combinatorics#class-powerset
  // new PowerSet(['a', 'b', 'c']);
  // [
  //   [],
  //   [ 'a' ],
  //   [ 'b' ],
  //   [ 'a', 'b' ],
  //   [ 'c' ],
  //   [ 'a', 'c' ],
  //   [ 'b', 'c' ],
  //   [ 'a', 'b', 'c' ]
  // ]
  const homoglyphSets = new PowerSet(potentialHomoglyphs);
  for (const homoglyphSet of homoglyphSets) {
    // skip sets with a large number of homoglyphs due to high risk of False Positives

    if (
      homoglyphSet.length > config.maxASCIIHomoglyphsNumber ||
      Math.round((homoglyphSet.length * 100) / nameChars.length) > config.maxASCIIHomoglyphsPercent
    ) {
      continue;
    }

    // we may have a subset containing multiple glyphs with the same positions: ['a|1', 'i|3', 'ik|3', 'n|5', 'nn|5'];

    // group by position
    const groupsByPosition = groupBy(homoglyphSet, (v) => v.position);
    // calc cartesian product of glyphs grouped by positions,
    // this will give us sets of glyphs without duplicate positions;
    const normalizedHomoglyphsSets = new CartesianProduct(...Object.values(groupsByPosition));

    // the result of Cartesian product should look as follows:
    // ['a|1', 'i|3', 'ik|3', 'n|5', 'nn|5'] ->
    // [["a|1", "i|3", "n|5"], ["a|1", "ik|3", "n|5"], ["a|1", "i|3", "nn|5"], ["a|1", "ik|3", "nn|5"]]

    for (const homoglyphSet of normalizedHomoglyphsSets) {
      // we iterate sets of ASCII homoglyphs that can have multiple similar looking characters,
      // e.g. "1" could be interpreted as ['i', 'l']

      // ["a|1", "i|3", "n|5"] -> [["a|1"], ['l|3', '1|3'], ["n|5"]]
      const homoglyphInterpretations = homoglyphSet.map(({ homoglyph, ...rest }) => {
        const asciiCharacters = ASCII_CHARACTERS_BY_ASCII_HOMOGLYPH[homoglyph];
        return asciiCharacters.map((char) => ({ char, ...rest }));
      });

      // ["a|1", ['l|3', '1|3'], "n|5"] -> [["a|1", 'l|3', "n|5"], ["a|1", '1|3', "n|5"]]
      const interpretationSets = new CartesianProduct(...homoglyphInterpretations);

      for (const set of interpretationSets) {
        const chars = nameChars.slice();
        let shift = 0;
        for (const { char, position, places } of set) {
          chars.splice(position + shift, places, char);
          shift += Array.from(char).length - places;
        }
        // remove gaps and combine chars into one string name
        nameVariants.add(chars.join(''));
      }
    }
  }

  // make sure that we return an array with new name variations
  return [...nameVariants].filter((n) => n.length > 0 && n !== name);
}
