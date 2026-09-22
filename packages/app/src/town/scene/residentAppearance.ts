import { HAIRSTYLES, OUTFITS, BOTTOMS, SHOE_STYLES, type CharacterOptions } from "@tardietown/characters"

const skins = ["#d9a17d", "#ae7655", "#f1c9a5", "#794f3a", "#bd8a66", "#e7b695"]
const hairColors = ["#493c35", "#292b2b", "#b58754", "#32323b", "#bcb5a5"]
const shirts = ["#83aaa4", "#bd806e", "#8e9e6d", "#9b8bab", "#d0b477", "#6d8599"]
export function residentAppearance(index: number): CharacterOptions {
  return {
    hairstyle: HAIRSTYLES[index % HAIRSTYLES.length]!,
    outfit: OUTFITS[index % OUTFITS.length]!,
    bottom: BOTTOMS[Math.floor(index / 2) % BOTTOMS.length]!,
    shoes: SHOE_STYLES[index % SHOE_STYLES.length]!,
    palette: { skin: skins[index % skins.length]!, hair: hairColors[index % hairColors.length]!, shirt: shirts[index % shirts.length]!, trousers: index % 2 ? "#58635e" : "#45545e", shoes: index % 3 ? "#efe3cf" : "#ac8162" },
    accessories: { glasses: index % 4 === 1, backpack: index % 5 === 2, cap: index % 7 === 6 }
  }
}
