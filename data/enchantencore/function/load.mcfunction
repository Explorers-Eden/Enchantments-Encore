##cleanup
scoreboard objectives remove enchantencore.leaf_jumper
scoreboard objectives remove enchantencore.pegasus
scoreboard objectives remove enchantencore.sneaktime

##add scoreboards
scoreboard objectives add enchantencore.sneaktime minecraft.custom:minecraft.sneak_time
scoreboard objectives add enchantencore.technical dummy
scoreboard objectives add enchantencore.leaf_jumper dummy
scoreboard objectives add enchantencore.pegasus dummy
scoreboard objectives add enchantencore.red_moon dummy
scoreboard objectives add enchantencore.has_died deathCount

##schedule functions
schedule function enchantencore:schedules/1tick 1t
schedule function enchantencore:schedules/10tick 10t