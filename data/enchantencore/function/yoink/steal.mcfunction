##runs as the hooked mob: move its main hand item to the fishing player
execute unless data entity @s equipment.mainhand run return fail

execute at @p[tag=ee.yoink.self] run summon minecraft:item ~ ~ ~ {Item:{id:"minecraft:stone",count:1},PickupDelay:0,Tags:["ee.yoink.new"]}
data modify entity @e[type=minecraft:item,tag=ee.yoink.new,limit=1] Item set from entity @s equipment.mainhand
tag @e[type=minecraft:item,tag=ee.yoink.new] remove ee.yoink.new
item replace entity @s weapon.mainhand with air

execute at @p[tag=ee.yoink.self] run playsound minecraft:entity.item.pickup player @a ~ ~ ~ 1 0.7
