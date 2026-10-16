scoreboard players reset @s enchantencore.refuel

##right-click uses the mainhand first, so a rocket in the mainhand is the one that was fired
execute if items entity @s weapon.mainhand minecraft:firework_rocket run function enchantencore:refuel/mainhand
execute unless items entity @s weapon.mainhand minecraft:firework_rocket if items entity @s weapon.offhand minecraft:firework_rocket run function enchantencore:refuel/offhand

data remove storage enchantencore:refuel cand
