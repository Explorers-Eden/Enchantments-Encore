schedule function enchantencore:void_vision_curse 9t

execute as @a if items entity @s armor.head #minecraft:head_armor[minecraft:enchantments~[{enchantments:"enchantencore:void_vision_curse",level:1}]] run \
    posteffect add @s enchantencore:void_warp

execute as @a unless items entity @s armor.head #minecraft:head_armor[minecraft:enchantments~[{enchantments:"enchantencore:void_vision_curse",level:1}]] run \
    posteffect remove @s enchantencore:void_warp