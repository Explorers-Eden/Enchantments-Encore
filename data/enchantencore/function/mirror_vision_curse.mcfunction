schedule function enchantencore:mirror_vision_curse 9t

execute as @a if items entity @s armor.head #minecraft:head_armor[minecraft:enchantments~[{enchantments:"enchantencore:mirror_vision_curse",level:1}]] run return run \
    posteffect add @s enchantencore:mirror_h

execute as @a unless items entity @s armor.head #minecraft:head_armor[minecraft:enchantments~[{enchantments:"enchantencore:mirror_vision_curse",level:1}]] run return run \
    posteffect remove @s enchantencore:mirror_h  