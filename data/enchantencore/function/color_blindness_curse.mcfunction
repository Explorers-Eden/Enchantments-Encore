schedule function enchantencore:color_blindness_curse 9t

execute as @a if items entity @s armor.head #minecraft:head_armor[minecraft:enchantments~[{enchantments:"enchantencore:color_blindness_curse",level:1}]] run return run \
    posteffect add @s enchantencore:achromatopsia

execute as @a unless items entity @s armor.head #minecraft:head_armor[minecraft:enchantments~[{enchantments:"enchantencore:color_blindness_curse",level:1}]] run return run \
    posteffect remove @s enchantencore:achromatopsia  