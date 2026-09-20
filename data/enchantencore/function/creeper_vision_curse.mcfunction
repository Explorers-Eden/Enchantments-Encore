schedule function enchantencore:creeper_vision_curse 9t

execute as @a if items entity @s armor.head #minecraft:head_armor[minecraft:enchantments~[{enchantments:"enchantencore:creeper_vision_curse",level:1}]] run \
    posteffect add @s minecraft:creeper

execute as @a unless items entity @s armor.head #minecraft:head_armor[minecraft:enchantments~[{enchantments:"enchantencore:creeper_vision_curse",level:1}]] run \
    posteffect remove @s minecraft:creeper  