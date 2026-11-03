tag @e[type=player,distance=..12] remove ee.temp.seeker

execute as @e[type=player,distance=..4] if items entity @s armor.head #minecraft:enchantable/head_armor[minecraft:enchantments~[{enchantments:"enchantencore:seeker",levels:1}]] run tag @s add ee.temp.seeker
execute as @e[type=player,distance=..8] if items entity @s armor.head #minecraft:enchantable/head_armor[minecraft:enchantments~[{enchantments:"enchantencore:seeker",levels:2}]] run tag @s add ee.temp.seeker
execute as @e[type=player,distance=..12] if items entity @s armor.head #minecraft:enchantable/head_armor[minecraft:enchantments~[{enchantments:"enchantencore:seeker",levels:3}]] run tag @s add ee.temp.seeker

# Only the glow Seeker turned on is turned off again (items glowing for other reasons keep it)
execute unless entity @e[type=player,distance=..12,tag=ee.temp.seeker] if entity @s[tag=ee.seeker_lit] run data modify entity @s Glowing set value 0b
execute unless entity @e[type=player,distance=..12,tag=ee.temp.seeker] run tag @s remove ee.seeker_lit
execute if entity @e[type=player,distance=..12,tag=ee.temp.seeker] unless entity @s[tag=ee.seeker_lit] unless data entity @s {Glowing:1b} run tag @s add ee.seeker_lit
execute if entity @s[tag=ee.seeker_lit] run data modify entity @s Glowing set value 1b
