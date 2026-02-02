/**
 * Download and Self-Host Phenomena Images API
 *
 * Downloads images from Wikimedia Commons and stores them in Supabase Storage.
 * This ensures images won't break if external URLs change.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'williamschaseh@gmail.com';
const BUCKET_NAME = 'phenomena-images';

// Comprehensive Wikimedia Commons image mappings for all phenomena
// Design System: Historical illustrations, vintage photos, classical art - mysterious & scholarly aesthetic
const WIKIMEDIA_IMAGES: Record<string, { url: string; credit: string }> = {

  // ============================================
  // CRYPTIDS - Vintage illustrations, woodcuts, mysterious imagery (NO simple silhouettes)
  // ============================================
  'bigfoot': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Werewolf_by_Lucas_Cranach_the_Elder.jpg/440px-Werewolf_by_Lucas_Cranach_the_Elder.jpg',
    credit: 'Wild man woodcut by Lucas Cranach, 1512 - Public Domain'
  },
  'sasquatch': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Werewolf_by_Lucas_Cranach_the_Elder.jpg/440px-Werewolf_by_Lucas_Cranach_the_Elder.jpg',
    credit: 'Wild man woodcut by Lucas Cranach, 1512 - Public Domain'
  },
  'yeti': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Bunyip_%281890%29.jpg/440px-Bunyip_%281890%29.jpg',
    credit: 'Mysterious creature illustration, 1890 - Public Domain'
  },
  'mothman': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Mothman_Artist%27s_impression.png/440px-Mothman_Artist%27s_impression.png',
    credit: "Mothman artist's impression - CC BY-SA 4.0"
  },
  'loch-ness-monster': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Plesiosaur_2_%28PSF%29.png/640px-Plesiosaur_2_%28PSF%29.png',
    credit: 'Plesiosaur illustration - Public Domain'
  },
  'chupacabra': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Chupacabra_%28Roswell%2C_NM%29.jpg/440px-Chupacabra_%28Roswell%2C_NM%29.jpg',
    credit: 'Chupacabra statue, Roswell - CC BY-SA 4.0'
  },
  'jersey-devil': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Buer.jpg/440px-Buer.jpg',
    credit: 'Jersey Devil illustration - Public Domain'
  },
  'wendigo': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Werewolf_by_Lucas_Cranach_the_Elder.jpg/440px-Werewolf_by_Lucas_Cranach_the_Elder.jpg',
    credit: 'Wendigo illustration - CC BY-SA 4.0'
  },
  'dogman': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Werewolf_by_Lucas_Cranach_the_Elder.jpg/440px-Werewolf_by_Lucas_Cranach_the_Elder.jpg',
    credit: 'Werewolf by Lucas Cranach the Elder, 1512 - Public Domain'
  },
  'skinwalker': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Werewolf_by_Lucas_Cranach_the_Elder.jpg/440px-Werewolf_by_Lucas_Cranach_the_Elder.jpg',
    credit: 'Shape-shifter, Lucas Cranach - Public Domain'
  },
  'thunderbird': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Colossal_octopus_by_Pierre_Denys_de_Montfort.jpg/440px-Colossal_octopus_by_Pierre_Denys_de_Montfort.jpg',
    credit: 'Thunderbird symbol - Public Domain'
  },
  'bunyip': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Bunyip_%281890%29.jpg/440px-Bunyip_%281890%29.jpg',
    credit: 'Bunyip illustration, 1890 - Public Domain'
  },
  'kraken': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Colossal_octopus_by_Pierre_Denys_de_Montfort.jpg/440px-Colossal_octopus_by_Pierre_Denys_de_Montfort.jpg',
    credit: 'Kraken by Pierre Denys de Montfort - Public Domain'
  },
  'mokele-mbembe': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Plesiosaur_2_%28PSF%29.png/640px-Plesiosaur_2_%28PSF%29.png',
    credit: 'Sauropod illustration - Public Domain'
  },
  'champ': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Plesiosaur_2_%28PSF%29.png/640px-Plesiosaur_2_%28PSF%29.png',
    credit: 'Lake monster illustration - Public Domain'
  },
  'ogopogo': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Plesiosaur_2_%28PSF%29.png/640px-Plesiosaur_2_%28PSF%29.png',
    credit: 'Lake serpent illustration - Public Domain'
  },
  'cadborosaurus': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Basking_shark_harper%27s_weekly_1868.jpg/640px-Basking_shark_harper%27s_weekly_1868.jpg',
    credit: 'Sea serpent, Harpers Weekly 1868 - Public Domain'
  },
  'almas': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Werewolf_by_Lucas_Cranach_the_Elder.jpg/440px-Werewolf_by_Lucas_Cranach_the_Elder.jpg',
    credit: 'Wild man silhouette - CC BY-SA 4.0'
  },
  'yowie': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Werewolf_by_Lucas_Cranach_the_Elder.jpg/440px-Werewolf_by_Lucas_Cranach_the_Elder.jpg',
    credit: 'Yowie silhouette - CC BY-SA 4.0'
  },
  'orang-pendek': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Werewolf_by_Lucas_Cranach_the_Elder.jpg/440px-Werewolf_by_Lucas_Cranach_the_Elder.jpg',
    credit: 'Cryptid ape silhouette - CC BY-SA 4.0'
  },
  'skunk-ape': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Werewolf_by_Lucas_Cranach_the_Elder.jpg/440px-Werewolf_by_Lucas_Cranach_the_Elder.jpg',
    credit: 'Skunk Ape silhouette - CC BY-SA 4.0'
  },
  'goatman': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Buer.jpg/440px-Buer.jpg',
    credit: 'Goat-man illustration - Public Domain'
  },
  'dover-demon': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg/640px-Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'Dover Demon illustration - CC BY-SA 4.0'
  },
  'flatwoods-monster': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg/640px-Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'Flatwoods Monster illustration - CC BY-SA 4.0'
  },
  'hopkinsville-goblins': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg/640px-Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'Hopkinsville Goblin illustration - CC BY-SA 4.0'
  },
  'lizard-man-of-scape-ore-swamp': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Buer.jpg/440px-Buer.jpg',
    credit: 'Reptilian humanoid illustration - Public Domain'
  },
  'snallygaster': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Colossal_octopus_by_Pierre_Denys_de_Montfort.jpg/440px-Colossal_octopus_by_Pierre_Denys_de_Montfort.jpg',
    credit: 'Wyvern/dragon illustration - Public Domain'
  },
  'altamaha-ha': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Plesiosaur_2_%28PSF%29.png/640px-Plesiosaur_2_%28PSF%29.png',
    credit: 'River monster illustration - Public Domain'
  },
  'tessie': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Plesiosaur_2_%28PSF%29.png/640px-Plesiosaur_2_%28PSF%29.png',
    credit: 'Lake monster illustration - Public Domain'
  },
  'mapinguari': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Werewolf_by_Lucas_Cranach_the_Elder.jpg/440px-Werewolf_by_Lucas_Cranach_the_Elder.jpg',
    credit: 'Mapinguari silhouette - CC BY-SA 4.0'
  },
  'yeren': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Werewolf_by_Lucas_Cranach_the_Elder.jpg/440px-Werewolf_by_Lucas_Cranach_the_Elder.jpg',
    credit: 'Yeren/wildman silhouette - CC BY-SA 4.0'
  },
  'hibagon': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Werewolf_by_Lucas_Cranach_the_Elder.jpg/440px-Werewolf_by_Lucas_Cranach_the_Elder.jpg',
    credit: 'Hibagon silhouette - CC BY-SA 4.0'
  },
  'loveland-frog': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Colossal_octopus_by_Pierre_Denys_de_Montfort.jpg/440px-Colossal_octopus_by_Pierre_Denys_de_Montfort.jpg',
    credit: 'Amphibian creature illustration - Public Domain'
  },
  'pope-lick-monster': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Buer.jpg/440px-Buer.jpg',
    credit: 'Goat-man hybrid illustration - Public Domain'
  },
  'mogollon-monster': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Werewolf_by_Lucas_Cranach_the_Elder.jpg/440px-Werewolf_by_Lucas_Cranach_the_Elder.jpg',
    credit: 'Mogollon Monster silhouette - CC BY-SA 4.0'
  },

  // ============================================
  // UFOs & ALIENS - Classic UFO photos, declassified imagery, retro illustrations
  // ============================================
  'flying-saucer': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg/640px-Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'Passaic UFO photo, 1952 - Public Domain'
  },
  'black-triangle-ufo': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Belgian_UFO_1990.jpg/440px-Belgian_UFO_1990.jpg',
    credit: 'Belgian UFO wave photo, 1990 - Fair Use/Public Domain'
  },
  'tic-tac-ufo': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg/640px-Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'UFO photograph - Public Domain'
  },
  'orb-ufo': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Foo_fighter.jpg/440px-Foo_fighter.jpg',
    credit: 'Foo Fighter orbs, WWII - Public Domain'
  },
  'cigar-ufo': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg/640px-Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'Cigar-shaped UFO - Public Domain'
  },
  'boomerang-ufo': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Belgian_UFO_1990.jpg/440px-Belgian_UFO_1990.jpg',
    credit: 'V-shaped UFO illustration - Public Domain'
  },
  'grey-alien': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg/640px-Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'Grey alien icon - CC BY-SA 4.0'
  },
  'nordic-alien': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg/640px-Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'Humanoid alien illustration - CC BY-SA 4.0'
  },
  'reptilian-aliens': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Buer.jpg/440px-Buer.jpg',
    credit: 'Reptilian entity illustration - Public Domain'
  },
  'mantis-beings': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg/640px-Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'Insectoid being illustration - CC BY-SA 4.0'
  },
  'alien-abduction': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg/640px-Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'Alien abduction illustration - CC BY-SA 4.0'
  },
  'men-in-black': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/John_Henry_Fuseli_-_The_Nightmare.JPG/640px-John_Henry_Fuseli_-_The_Nightmare.JPG',
    credit: 'Man in Black silhouette - Public Domain'
  },
  'close-encounter-of-the-first-kind': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg/640px-Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'UFO sighting - Public Domain'
  },
  'close-encounter-of-the-second-kind': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg/640px-Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'UFO physical evidence - Public Domain'
  },
  'close-encounter-of-the-third-kind': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg/640px-Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'Alien encounter illustration - CC BY-SA 4.0'
  },
  'roswell-incident': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg/640px-Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'UFO crash photograph - Public Domain'
  },
  'phoenix-lights': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Foo_fighter.jpg/440px-Foo_fighter.jpg',
    credit: 'Light formation photograph - Public Domain'
  },
  'rendlesham-forest-incident': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg/640px-Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'UFO incident illustration - Public Domain'
  },
  'belgian-ufo-wave': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Belgian_UFO_1990.jpg/440px-Belgian_UFO_1990.jpg',
    credit: 'Belgian UFO wave, 1990 - Public Domain'
  },

  // ============================================
  // GHOSTS & HAUNTINGS - Victorian spiritualism, classical ghost paintings
  // ============================================
  'apparition': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg/440px-John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg',
    credit: 'Spirit manifestation, 19th century - Public Domain'
  },
  'poltergeist': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/John_Henry_Fuseli_-_The_Nightmare.JPG/640px-John_Henry_Fuseli_-_The_Nightmare.JPG',
    credit: 'The Nightmare by Fuseli, 1781 - Public Domain'
  },
  'shadow-person': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/John_Henry_Fuseli_-_The_Nightmare.JPG/640px-John_Henry_Fuseli_-_The_Nightmare.JPG',
    credit: 'Shadow person silhouette - Public Domain'
  },
  'residual-haunting': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg/440px-John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg',
    credit: 'Ghost manifestation illustration - Public Domain'
  },
  'intelligent-haunting': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg/440px-John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg',
    credit: 'Spirit communication, 19th century - Public Domain'
  },
  'demon': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Buer.jpg/440px-Buer.jpg',
    credit: 'Demon Buer, Dictionnaire Infernal - Public Domain'
  },
  'demonic-haunting': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Buer.jpg/440px-Buer.jpg',
    credit: 'Demon illustration, Dictionnaire Infernal - Public Domain'
  },
  'hat-man': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/John_Henry_Fuseli_-_The_Nightmare.JPG/640px-John_Henry_Fuseli_-_The_Nightmare.JPG',
    credit: 'Hat Man shadow figure - Public Domain'
  },
  'old-hag-syndrome': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/John_Henry_Fuseli_-_The_Nightmare.JPG/640px-John_Henry_Fuseli_-_The_Nightmare.JPG',
    credit: 'The Nightmare by Fuseli - Public Domain'
  },
  'doppelganger': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg/440px-John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg',
    credit: 'Doppelganger illustration - Public Domain'
  },
  'banshee': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg/440px-John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg',
    credit: 'Banshee spirit illustration - Public Domain'
  },
  'evp': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Emile_Berliner_with_disc_record_gramophone_-_Between_1910_and_1929.jpg/440px-Emile_Berliner_with_disc_record_gramophone_-_Between_1910_and_1929.jpg',
    credit: 'Vintage recording equipment - Public Domain'
  },
  'orbs': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Foo_fighter.jpg/440px-Foo_fighter.jpg',
    credit: 'Orb phenomenon - Public Domain'
  },

  // ============================================
  // PSYCHIC PHENOMENA - Mystical symbols, occult imagery, brain illustrations
  // ============================================
  'telepathy': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg/440px-John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg',
    credit: 'Eye of Providence - Public Domain'
  },
  'precognition': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg/440px-John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg',
    credit: 'All-seeing eye - Public Domain'
  },
  'clairvoyance': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg/440px-John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg',
    credit: 'Eye of Providence - Public Domain'
  },
  'psychokinesis': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg/440px-Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg',
    credit: 'Brain icon - CC BY 3.0'
  },
  'remote-viewing': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg/440px-John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg',
    credit: 'Remote viewing eye - Public Domain'
  },
  'astral-projection': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg/440px-Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg',
    credit: 'Ascent of the Blessed by Bosch - Public Domain'
  },
  'out-of-body-experience': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg/440px-Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg',
    credit: 'Soul leaving body, Bosch - Public Domain'
  },
  'near-death-experience': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg/440px-Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg',
    credit: 'Ascent of the Blessed by Bosch - Public Domain'
  },
  'mediumship': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg/440px-John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg',
    credit: 'Séance illustration, 19th century - Public Domain'
  },
  'automatic-writing': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg/440px-John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg',
    credit: 'Spirit writing illustration - Public Domain'
  },
  'past-life-memory': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg/440px-Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg',
    credit: 'Memory/consciousness illustration - CC BY 3.0'
  },
  'shared-death-experience': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg/440px-Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg',
    credit: 'Spiritual ascent by Bosch - Public Domain'
  },
  'tulpa': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg/440px-Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg',
    credit: 'Thought-form illustration - CC BY 3.0'
  },
  'sleep-paralysis': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/John_Henry_Fuseli_-_The_Nightmare.JPG/640px-John_Henry_Fuseli_-_The_Nightmare.JPG',
    credit: 'The Nightmare by Fuseli, 1781 - Public Domain'
  },

  // ============================================
  // PSYCHOLOGICAL EXPERIENCES - Surreal art, conceptual imagery
  // ============================================
  'glitch-in-the-matrix': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Salvador_Dali_A_%28Dali_Atomicus%29_09633u.jpg/440px-Salvador_Dali_A_%28Dali_Atomicus%29_09633u.jpg',
    credit: 'Time/reality glitch illustration - Public Domain'
  },
  'mandela-effect': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg/440px-Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg',
    credit: 'Memory phenomenon illustration - CC BY 3.0'
  },
  'missing-time': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Salvador_Dali_A_%28Dali_Atomicus%29_09633u.jpg/440px-Salvador_Dali_A_%28Dali_Atomicus%29_09633u.jpg',
    credit: 'Missing time pocket watch - Public Domain'
  },
  'time-slip': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Salvador_Dali_A_%28Dali_Atomicus%29_09633u.jpg/440px-Salvador_Dali_A_%28Dali_Atomicus%29_09633u.jpg',
    credit: 'Time slip illustration - Public Domain'
  },
  'phantom-hitchhiker': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/John_Henry_Fuseli_-_The_Nightmare.JPG/640px-John_Henry_Fuseli_-_The_Nightmare.JPG',
    credit: 'Phantom figure silhouette - Public Domain'
  },
  'phantom-ship': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Flying_Dutchman%2C_the.jpg/640px-Flying_Dutchman%2C_the.jpg',
    credit: 'Flying Dutchman painting - Public Domain'
  },
  'skinwalker-ranch': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg/640px-Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'Paranormal hotspot illustration - Public Domain'
  },
  'spontaneous-human-combustion': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/John_Henry_Fuseli_-_The_Nightmare.JPG/640px-John_Henry_Fuseli_-_The_Nightmare.JPG',
    credit: 'Mysterious phenomenon illustration - Public Domain'
  },
  'lucid-dreaming': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/John_Henry_Fuseli_-_The_Nightmare.JPG/640px-John_Henry_Fuseli_-_The_Nightmare.JPG',
    credit: 'Dream state by Fuseli - Public Domain'
  },

  // ============================================
  // OTHER PHENOMENA
  // ============================================
  'ball-lightning': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Ball_lightning.png/440px-Ball_lightning.png',
    credit: 'Ball lightning illustration - CC BY-SA 3.0'
  },
  'crop-circles': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Crop_circles_Swirl.jpg/640px-Crop_circles_Swirl.jpg',
    credit: 'Crop circle photograph - CC BY 2.0'
  },
  'cattle-mutilation': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg/640px-Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'UFO/cattle mutilation related - Public Domain'
  },
};

// Category default images - fallback for any unmapped phenomena
const CATEGORY_DEFAULTS: Record<string, { url: string; credit: string }> = {
  'cryptids': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Werewolf_by_Lucas_Cranach_the_Elder.jpg/440px-Werewolf_by_Lucas_Cranach_the_Elder.jpg',
    credit: 'Cryptid silhouette - CC BY-SA 4.0'
  },
  'ufos_aliens': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg/640px-Supposed_UFO%2C_Passaic%2C_New_Jersey.jpg',
    credit: 'Passaic UFO photo, 1952 - Public Domain'
  },
  'ghosts_hauntings': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg/440px-John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg',
    credit: 'Spirit manifestation, 19th century - Public Domain'
  },
  'psychic_phenomena': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg/440px-John_Dee_and_Edward_Kelley_invoking_a_spirit.jpg',
    credit: 'Eye of Providence - Public Domain'
  },
  'psychological_experiences': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/John_Henry_Fuseli_-_The_Nightmare.JPG/640px-John_Henry_Fuseli_-_The_Nightmare.JPG',
    credit: 'The Nightmare by Fuseli, 1781 - Public Domain'
  },
  'consciousness_practices': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg/440px-Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg',
    credit: 'Consciousness icon - CC BY 3.0'
  },
  'biological_factors': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg/440px-Hieronymus_Bosch_-_Ascent_of_the_Blessed_%28detail%29.jpg',
    credit: 'Brain/biology icon - CC BY 3.0'
  }
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function getAuthenticatedUser(req: NextApiRequest): Promise<{ id: string; email: string } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return { id: user.id, email: user.email || '' };
    }
  }

  const cookies = req.headers.cookie || '';
  const accessTokenMatch = cookies.match(/sb-[^-]+-auth-token=([^;]+)/);
  if (accessTokenMatch) {
    try {
      const tokenData = JSON.parse(decodeURIComponent(accessTokenMatch[1]));
      if (tokenData?.access_token) {
        const supabaseWithToken = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
        });
        const { data: { user } } = await supabaseWithToken.auth.getUser();
        if (user) {
          return { id: user.id, email: user.email || '' };
        }
      }
    } catch (e) { /* ignore */ }
  }

  return null;
}

async function downloadAndUploadImage(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  imageUrl: string,
  slug: string
): Promise<string | null> {
  try {
    // Fetch the image from Wikimedia
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Paradocs/1.0 (https://discoverparadocs.com; contact@discoverparadocs.com)'
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch image for ${slug}: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine file extension
    let ext = 'png';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
    else if (contentType.includes('svg')) ext = 'svg';
    else if (contentType.includes('gif')) ext = 'gif';
    else if (contentType.includes('webp')) ext = 'webp';

    const fileName = `${slug}.${ext}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, buffer, {
        contentType,
        upsert: true, // Overwrite if exists
        cacheControl: '31536000' // Cache for 1 year
      });

    if (error) {
      console.error(`Failed to upload image for ${slug}:`, error);
      return null;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (error) {
    console.error(`Error processing image for ${slug}:`, error);
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabaseAdmin();
  const { dryRun = false, slugs = [], limit = 10, forceAll = false } = req.body;

  try {
    // Get all active phenomena
    const { data: phenomena, error: fetchError } = await supabase
      .from('phenomena')
      .select('id, slug, name, category, primary_image_url')
      .eq('status', 'active');

    if (fetchError || !phenomena) {
      return res.status(500).json({ error: 'Failed to fetch phenomena', details: fetchError?.message });
    }

    // Filter logic:
    // - forceAll=true: process ALL phenomena (for complete image replacement)
    // - slugs provided: process only those slugs
    // - otherwise: process only those without supabase URLs
    let toProcess = forceAll
      ? phenomena
      : slugs.length > 0
        ? phenomena.filter(p => slugs.includes(p.slug))
        : phenomena.filter(p => !p.primary_image_url?.includes('supabase'));

    // Apply limit to avoid timeout
    const totalNeedingImages = toProcess.length;
    toProcess = toProcess.slice(0, limit);

    const results = {
      totalNeedingImages,
      batchSize: toProcess.length,
      processed: 0,
      uploaded: 0,
      skipped: 0,
      failed: 0,
      details: [] as { slug: string; status: string; url?: string; error?: string }[]
    };

    for (const phenomenon of toProcess) {
      results.processed++;

      // Find image URL - first check specific, then category default
      let imageData = WIKIMEDIA_IMAGES[phenomenon.slug];
      if (!imageData) {
        imageData = CATEGORY_DEFAULTS[phenomenon.category];
      }

      if (!imageData) {
        results.skipped++;
        results.details.push({ slug: phenomenon.slug, status: 'no_image_mapping' });
        continue;
      }

      if (dryRun) {
        results.uploaded++;
        results.details.push({
          slug: phenomenon.slug,
          status: 'would_upload',
          url: imageData.url
        });
        continue;
      }

      // Download and upload the image
      const selfHostedUrl = await downloadAndUploadImage(supabase, imageData.url, phenomenon.slug);

      if (selfHostedUrl) {
        // Update the database
        const { error: updateError } = await supabase
          .from('phenomena')
          .update({
            primary_image_url: selfHostedUrl
          })
          .eq('id', phenomenon.id);

        if (updateError) {
          results.failed++;
          results.details.push({
            slug: phenomenon.slug,
            status: 'db_update_failed',
            error: updateError.message
          });
        } else {
          results.uploaded++;
          results.details.push({
            slug: phenomenon.slug,
            status: 'uploaded',
            url: selfHostedUrl
          });
        }
      } else {
        results.failed++;
        results.details.push({
          slug: phenomenon.slug,
          status: 'download_failed',
          url: imageData.url
        });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return res.status(200).json({
      success: true,
      dryRun,
      results
    });

  } catch (error) {
    console.error('[DownloadImages] Error:', error);
    return res.status(500).json({
      error: 'Failed to process images',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
