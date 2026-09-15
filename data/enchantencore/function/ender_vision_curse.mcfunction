schedule function enchantencore:ender_vision_curse 9t

execute as @a if items entity @s armor.head #minecraft:head_armor[minecraft:enchantments~[{enchantments:"enchantencore:ender_vision_curse",level:1}]] run return run \
    posteffect add @s minecraft:invert

execute as @a unless items entity @s armor.head #minecraft:head_armor[minecraft:enchantments~[{enchantments:"enchantencore:ender_vision_curse",level:1}]] run return run \
    posteffect remove @s minecraft:invert