##cleanup
scoreboard objectives remove enchantencore.leaf_jumper
scoreboard objectives remove enchantencore.pegasus
scoreboard objectives remove enchantencore.sneaktime

##add scoreboards
scoreboard objectives add enchantencore.sneaktime minecraft.custom:minecraft.sneak_time
scoreboard objectives add enchantencore.technical dummy
scoreboard objectives add enchantencore.leaf_jumper dummy
scoreboard objectives add enchantencore.pegasus dummy
scoreboard objectives add enchantencore.idle_time dummy

##schedule functions
schedule function enchantencore:schedules/10_tick 10t
schedule function enchantencore:schedules/5_tick 5t