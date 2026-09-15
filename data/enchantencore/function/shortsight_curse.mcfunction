schedule function enchantencore:shortsight_curse 9t

execute as @a if items entity @s armor.head #minecraft:head_armor[minecraft:enchantments~[{enchantments:"enchantencore:shortsight_curse",level:1}]] run return run \
    posteffect add @s enchantencore:blur

execute as @a unless items entity @s armor.head #minecraft:head_armor[minecraft:enchantments~[{enchantments:"enchantencore:shortsight_curse",level:1}]] run return run \
    posteffect remove @s enchantencore:blur  