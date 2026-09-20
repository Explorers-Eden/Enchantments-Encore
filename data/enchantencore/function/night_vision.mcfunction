schedule function enchantencore:night_vision 9t

execute as @a if items entity @s armor.head #minecraft:head_armor[minecraft:enchantments~[{enchantments:"enchantencore:night_vision",level:1}]] run \
    posteffect add @s enchantencore:nightvision

execute as @a unless items entity @s armor.head #minecraft:head_armor[minecraft:enchantments~[{enchantments:"enchantencore:night_vision",level:1}]] run \
    posteffect remove @s enchantencore:nightvision  