jsPsych.plugins["mot-game"] = (function() {
  var plugin = {};

  plugin.info = {
    name: 'mot-game',
    parameters: {
    }
  }

  plugin.trial = function(display_element, trial) {
    var par = trial
    var w=par.gameWidth, h=par.gameHeight;

    display_element.innerHTML =
    "<div id='gameContainer' height='" + h + "' width='" + w + "'>" +
    "<!-background image:--><img src='robomb-pngs/floor.png' height='" + h + "' width='" + w + "' style='position:absolute; margin:auto; z-index:-100'></img>" +
    "<!--main canvas where game happens:-->" +
    "<canvas id='mainCanvas' height='" + h + "' width = '" + w + "'></canvas>"
    +
    "<!--overlay canvas that doesn't need to be refreshed constantly:-->" +
    //it may be good to not hard-code the top and left value but rather use variables...this will be decided later when we do more styling
    "<canvas id='overlay' style='position:absolute; left: 0; top: 0; z-index:3' height='" + h + "' width = '" + w + "'></canvas>"
    +
    //it may be good to not hard-code the top and left value but rather use variables...this will be decided later when we do more styling
    "<canvas id='occluderCanvas' style='position:absolute; left: 0; top: 0; z-index:2' height='" + h + "' width = '" + w + "'></canvas>" +
    //canvas for timer display
    "<canvas id='timerCanvas' style='position:absolute; left: 0; top: 0; z-index:5' height='" + h + "' width = '" + w + "'></canvas>" +
    "<!--selection canvas for ball selection in defusal mode:-->" +
    //it may be good to not hard-code the top and left value but rather use variables...this will be decided later when we do more styling
    "<canvas id='selectionCanvas' style='position:absolute; left: 0; top: 0; z-index:1' height='" + h + "' width = '" + w + "'></canvas>" +
    "<canvas id='livesCanvas' style='position:absolute; left: 0; top: 0; z-index:3' height='" + h + "' width = '" + w + "'></canvas>" +
    "<div id='messageBox' style='display:none; animation-name: messagePopUpAnimation; animation-duration: 4s; position:fixed; z-index:500; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; user-select:none'><image id='messageImg' src='robomb-pngs/alert-box.png' style='display:block; margin-left: auto; margin-right: auto; margin-top: 10%; width: 20%; height: 30%; pointer-events:none'/><p id='msgText'></div>'" +
    "</div>" +
    "<div id='bottomScreenText' style='display:none; animation-name: scrollIt; animation-duration: 10s; position:absolute; z-index:500; left: 40%; top: 50%; width: 100%; height: 100%; overflow: auto'><p id='bottomText' style='user-select:none'>You've held out until the robots could be quarantined. +1 life. However, they are set to go off soon. You have 10 seconds to defuse them by clicking the right ones. \nYou have one defusal kit per bomb, so don't waste any</div>'" +
    //message pop-up animation:
    "<style>@keyframes fadeIn{from {opacity:0}; to {opacity:0.5}</style>  <style>@keyframes scrollIt{from {opacity:0}; to {opacity:1}</style>"

    var data = {
      levelDuration: par.duration,
      timeDefusalStarted: 0,
      defusalDuration: 0,
      defusalMode: "neverNeeded", //"neverNeeded", "successful", "timeRanOut", or "incorrectGuess"
      correctGuesses: null,
      incorrectGuesses: null,
      numWallsMade: 0,/*should it register each click?*/
      numRegBalls: par.numRegularBalls, //redundant
      numExplodingBalls: par.numExplodingBalls, //redundant with the following but makes life easier later for data analysis
      ballInitialConditions: [], //an array of objects representing balls and their respective initial conditions
      ballSpeed: par.ballSpeed,
      maxObstacles: par.maxUserDefinedObstacles,
      maxObstacleSegments:par.maxUserDefinedObstacleSegments,
      maxSegmentLength:par.maxDistanceBetweenObstaclePixels,
      minSegmentLength:par.minDistanceBetweenObstaclePixels,
      createdPoints:[],
      occluders: par.occluders,
      occluderRectangles: par.occluderRectangles,
      savedModel: par.savedModel,
      //delete all the above that begin with par. and replace it with:
      parameters: par

    }


    /*GAME CODE*/
    var ballColor = "grey"

    var distanceBetween = function(p1, p2){
      var xdist = p2[0]-p1[0]
      var ydist = p2[1]-p1[1]
      return Math.sqrt(xdist*xdist + ydist*ydist)
    }

    //generates a random number according to Gaussian distribution with mean 0 and standard deviation SD. It uses the Box-Muller transform method.
    //From https://stackoverflow.com/a/36481059
    var randGaussian = function(mean, sd){
       //they start at 0 so they're randomized anyway
       var a=0, b=0;
       //replace any 0 values with a random value becuase the BM transform uses the range (0,1)
       while(a==0) a=Math.random();
       while(b==0) b=Math.random();
       var randWithMeanZeroAnSDOne = Math.sqrt(-2*Math.log(a)) * Math.cos(2*Math.PI*b)
       return randWithMeanZeroAnSDOne * sd + mean
    }

    //point is in format [x,y]; rect is in format {x: , y: , width: , height: }
    var pointIsWithinRectangle = function(point, rect){
      var furthestRightCoordinate = rect.x + rect.width
      var furthestDownCoordinate = rect.y + rect.height
      if(point[0] >= Math.min(rect.x, furthestRightCoordinate) && point[0] <= Math.max(rect.x, furthestRightCoordinate) &&
         point[1] >= Math.min(rect.y, furthestDownCoordinate) && point[1] <= Math.max(rect.y, furthestDownCoordinate))//Math.min and Math.max are used in case
                                                                                                                      //the rectangle has negative dimensions and
                                                                                                                      //furthest____Coordinate isn't actually
                                                                                                                      //the furthest _____ coordinate - it's the opposite
      {
        return true
      } else {
        return false
      }
    }

    //pix has format [x,y]
    function getPixelPositionRelativeToObject(pix, object) {
      var posx = pix[0]-object.offsetLeft
      var posy = pix[1]-object.offsetTop
      //this resets any out-of-bounds pixels to within-bounds
      if(posx >= object.width){posx = object.width-1}
      if(posx <= 0){posx = 1}
      if(posy >= object.height){posy = object.height-1}
      if(posy <= 0){posy = 1}
      return [posx, posy]
    }

    //adds a point much like a user click does, but with a fake mousedown event
    function addReplayObstaclePointAfterTime (pt, time){
      setTimeout(function(){
        //fake "event" object (parentheses around it just to be sure the variables is super private since it's used by setTimeout and
        //must not be changed before setTimeout finishes execution)
        var event = {
         type: pt.eventType,
         x: pt.position[0],
         y: pt.position[1],
         isFromReplay: true
       }
       //mousedown events are recorded differently to the data and their position actually matches pageX and pageY coordinates. So they can be made accessible by pageX and pageY:
       if(event.type == "mousedown"){
         event.pageX = pt.position[0];
         event.pageY = pt.position[1]
       }
       curLevel.model.addPixelsToUserObstacles(event)
     }, time) //(the time created is measured after the gameplay part begins so initialFrameDuration is added)
  }
    function theLevel() { //now levels are based off parameters passed to jsPsych
      var levelDuration = 15000;
      var m = new model(par.numRegularBalls,par.numExplodingBalls,/*0.1*/par.ballSpeed)
      var v = new view(model)
      var c = new controller(m, v, levelDuration)
      return new level(m, v, c, levelDuration)
    }
    curLevel = theLevel();

    function model(numNormalBalls, numExplodingBalls, speed) {
      this.frozen = false //game pauses and model freezes
      this.freeze = function(){this.frozen = true}
      this.currentTime = 0
      this.balls = []; //including exploding balls
      this.getBalls = function(){return this.balls}
      this.explodingBalls = [];
      this.occluderRects = par.occluderRectangles
      this.getOccluderRects = function(){return this.occluderRects}
      /*this.occluders = [new occluder("occluders/occluder1.png", w/3, h/2), new occluder("occluders/occluder1.png", 2*w/3, h/2)];*/
      this.numExplodingBalls = function(){return this.explodingBalls.length}

      //set the number of lives as the number of lives from the second to last trial (last trial was waiting scren)
      var numLives = jsPsych.data.get().last(2).first(1).values()[0].numLives
      this.lives = (numLives === undefined) ? par.numLives : numLives
      //usually callback is view.showLives()
      this.decrementLives = function(callback){
        this.lives--
        callback();
      }
      this.incrementLives = function(callback){
        this.lives++
        callback();
      }

      var myself = this
      this.resetAllBallDesigns = function(){
        var balls = myself.getBalls()
        for(var m=0, numBalls = balls.length; m<numBalls; m++){
          balls[m].setImage("robomb-pngs/robot-normal.png");
        }
      }

      //initialize the balls:
      var randomCoordinatesForNormalBall = function(){
        var x = Math.round(1.5*ballRadius + Math.random()*(w-3*ballRadius));
        var y = Math.round(1.5*ballRadius + Math.random()*(h-3*ballRadius)); //.5*ballradius minimum distance from wall
        return [x,y]
      }

      var randomCoordinatesForExplodingBall = function(){
        var x = Math.round(10*ballRadius + Math.random()*(w-20*ballRadius));
        var y = Math.round(10*ballRadius + Math.random()*(h-20*ballRadius));
        return [x,y]
      }

      /*now, initialize the balls. how that is done depends on whether it's replay mode
      if(par.replayMode){

        var balls = par.replayModeParameters.ballInitialConditions
        //^these aren't actual ball objects; they're just the minimal data necessary to recreate the balls
        //now, recreate the balls and add them to this.balls. ballInitialConditions is an array of "ball" objects
        for(var i = 0, numBalls = balls.length; i < numBalls; i++){
          var b = balls[i]
          var explosiveParameter = b.explosive ? "e" : null //to be passed as parameter of whether to make the ball explosive. "e" makes the ball explosive
          this.balls.push(new ball(b.position[0], b.position[1], b.radius, 0, explosiveParameter))
          //now set the velocity of the ball (balls are initialized with speed, not velocity):
          this.balls[this.balls.length-1/*most recently pushed ball*].setVelocity(b.velocity)
        }

      } else {*/


        //now initialize balls, but make sure they aren't in occluders
        var ballRadius = par.ballRadius
        for(var i = 0; i<numNormalBalls; i++){
          //random x-y coordinates of a new ball:
          var coords = randomCoordinatesForNormalBall()
          //make sure the ball isn't inside any occluders:
            var inOcc = circleIsInAnOccluder(coords, ballRadius)
            while(inOcc){
              //reset the coordinates until the piwr and the coordinates are therefore valid
              coords = randomCoordinatesForNormalBall()
              inOcc = circleIsInAnOccluder(coords, ballRadius)
            }
          //make the ball (and add it to this.balls) if it's at a valid position:
          this.balls.push(new ball(coords[0],coords[1],ballRadius, speed, i/*id is just i*/))
        }



        //initialize the exploding balls:
        for(var i = 0; i<numExplodingBalls; i++){  //exploding balls can't be too close to the edges; that isn't fair

        //random x-y coordinates of a new exploding ball:
        var coords = randomCoordinatesForExplodingBall()
        //make sure the ball isn't inside any occluders:
          var inOcc = circleIsInAnOccluder(coords, ballRadius)
          while(inOcc){
            //reset the coordinates until they're not in the occluder
            coords = randomCoordinatesForExplodingBall()
            inOcc = circleIsInAnOccluder(coords, ballRadius)
          }

          var bal = new ball(coords[0], coords[1], ballRadius, speed, numNormalBalls + i/*explosive balls will have highest ids*/, "e")
          this.balls.push(bal)
          this.explodingBalls.push(bal)
        }



      /*Not using this inefficient wall type anymore:
      /*MAKE SURE TO NOT MAKE THE WIDTHS NEGATIVE - THE wall.highestPoint, leftestPoint, etc. methods will not work if they
       *are negative. It may be a good idea to make those methods work with negative values, but it seems that would be less
       *efficient because more steps would be involved in those methods, which are called a lot. It also may be good to have
       *the highestPoint, lowestPoint, etc. methods of the four walls at the edges of the canvas only be called once instead
       *of for every ball in every update. Also make sure the balls are not already touching the walls upon initialization
       this.walls = [new wall(0,0,w,1), new wall(0,0,1,h), new wall(0,h-2,w,1), new wall(w-2,0,1,h)], //default border walls of 0px
       */

       /*USING THIS INSTEAD:*/
       this.wallThickness = par.wallThickness



      /*USER OBSTACLE: a set of pixels that the user selected to be included in the "obstacle." The user probably sees this as
       *"obstacle" as multiple obstacles, but the program treats them all as one. It doesn't care how the pixels are grouped,
       *just where they are.
       *
       *The obstacle has a radius. If a ball is closer than ball.radius + obstacle.radius, a collision will be registered */

        this.maxObstacles = 1 //1 wall per exploding ball sounds good


        this.userObstacles = [];
        this.mostRecentObstacle = function(){return this.userObstacles[this.userObstacles.length-1]} //last element in the array
        this.addNewObstacle = function(){
          this.userObstacles.push(new userObstacle())
          data.numWallsMade++ //NOTE: For data collection, this may cause a problem: it will register a new obstacle even if it's just a point
         }

        this.removeExcessObstacles = function(){
          while(this.userObstacles.length > this.maxObstacles){ /*alert("shift");*/ this.userObstacles.shift()}
        }

        this.addPixelsToUserObstacles = function(event){
          //if(curLevel.model.userObstacles.length < 1){this.addNewObstacle()} //make a new user obstacle if none exist
          if(event.type == "mousedown"){
            //Make a new user obstacle if it was a mousedown not a mousemove. But first, collect the data.
            data.createdPoints.push(
              {position: [event.pageX, event.pageY],
               timeCreated: event.timeStamp - timestampWallCreationEnabled,//make timeCreated the event's time relative to the time wall creation was initially enabled
               eventType:event.type //mousedown events create new obstacles; mousemove events add points to them
            })

            //now, make the new obstacle:
            this.addNewObstacle()
          }

          //if(userObstacle.atMaxLength()){this.addNewObstacle()}     //make a new user obstacle if the current one has the maximum number of points

          //if(curLevel.model.mostRecentObstacle() === undefined){curLevel.model.addNewObstacle()}
          curLevel.model.mostRecentObstacle().addPixels(event)
          curLevel.model.removeExcessObstacles() //remove any excess obstaclds if there are any real-time, while pixels are being added
        }





      //functions to help find intersections of balls and obstacles:
      var equation = function(m,b){
        this.m = m;
        this.b = b;
        //getters and setters are probably unecessary
      }

      //arguments: point in form [x,y] and vec in form [xComponent, yComponent]
      function equationFromPointAnd2dVec(point, vec){
        var rise = vec[1]
        var run = vec[0]
        var slope = rise/run
        return equationFromPointAndSlope(point, slope)
      }

      function equationFromPointAndSlope(point, slope){
        var intercept =  point[1] - slope*point[0]
        return new equation(slope, intercept)
      }

      function intersectionOf2Equations(e1, e2){
          var x = (e2.b-e1.b)/(e1.m-e2.m)
          var y = e1.m*x+e1.b
          //console.assert(Math.round(y) == Math.round(e2.m*x+e2.b))//remove this for production if we reeally need an insignificant efficiency boost -
                                                                  //just checking whether both equations give the same y value for the x value
          return [x,y]
      }


      //returns the dot product of vectors (in the form of arrays) a and b
      function dot(a,b){
        var length = a.length
        if(length == b.length){
          dotp = 0
          for(var i = 0; i < length; i++){
            dotp += a[i]*b[i]
          }
          return dotp
        } else {
          return null
        }
      }
      //returns the norm of an n-dimensional vector a
      function norm(a){
        var s = 0
        var length = a.length
        for(var i=0; i<length; i++){
          s+=a[i]*a[i]
        }
        return Math.sqrt(s)
      }
      /*//normalizes vector a (a is a js array)
      function normalize(a){
        var s = 0
        var norm = norm(a)
        var length = a.length
        for(var i=0; i<length; i++){
          s.push(a[i]/norm)
        }
        return s
      }*/

      //returns the cosine between two vectors (as arrays) of n dimensions
      function nDimCosine(a,b) {
        return dot(a,b)/(norm(a)*norm(b))
      }
      this.ballAndObstacleCollisionStatus = function(ball,ob){
        var ballAndObSegmentCollision = {collisionHappening: false} //default value, if there's no collision just return this
        for(var r = 0, pix = ob.getPixels(), numPix = pix.length; r<numPix-1; r++){
          var wallPoint = pix[r]
          var nextWallPoint = pix[r+1]
          var segment = [wallPoint, nextWallPoint]
          ballAndObSegmentCollision = this.ballAndObstacleSegmentCollisionStatus(ball, segment)

          if(ballAndObSegmentCollision.collisionHappening){return ballAndObSegmentCollision} //if there's a collision, just pass the collision data
      }
      return ballAndObSegmentCollision //if none of the segment collisions happened, this returns the most recent segment's "collision" data, which,
                                       //like all of the other segments' "collision" data, contains a false value for collisionHappening. it's just
                                       //an arbitrary return value that has a similar format as the other return value this function gives but false
      }
      this.ballAndObstacleSegmentCollisionStatus = function(ball, segment){
        var wallPoint = segment[0]
        var nextWallPoint = segment[1]

        this.closestDistanceToObstacle = null

        var ballPoint = [ball.getX(), ball.getY()]
        var ballVec = ball.getVelocity()
        var ballTrajectoryEquation = equationFromPointAnd2dVec(ballPoint, ballVec)
        var rad = ball.getRadius()

          //compute distance between ball center and closest point on wall:
            //first find intersection of ball velocity vector and wall:
              //step 1. compute equations of lines (in slope-intercept form)
                var wallVec = [nextWallPoint[0]-wallPoint[0], nextWallPoint[1]-wallPoint[1]]
                var wallExtensionEquation = equationFromPointAnd2dVec(wallPoint, wallVec)

                var intersection = intersectionOf2Equations(ballTrajectoryEquation,wallExtensionEquation)


                var slopeOfWallNormal = -1/wallExtensionEquation.m
                var shortestLineFromBallToWall = equationFromPointAndSlope(ballPoint, slopeOfWallNormal)
                var collisionPoint = intersectionOf2Equations(shortestLineFromBallToWall, wallExtensionEquation)

                //see whether the ball is traveling toward the collision point or away:
                var ballToCollisionPointVec = [collisionPoint[0]-ballPoint[0], collisionPoint[1]-ballPoint[1]]
                var ballVecLength = norm(ballVec)
                var cos = (nDimCosine(ballVec, ballToCollisionPointVec))
                var travellingTowardsWall = (cos > 0)
                if(travellingTowardsWall){ //only collide if it's traveling towards the wall - there's a bug that in rare situations, balls moving away can collide and get stuck inside the obstacle.
                  //curLevel.view.showPoint(collisionPoint)
                  //curLevel.view.showPoint([ballPoint[0]+ballVec[0]*1000, ballPoint[1]+ballVec[1]*1000])
                  //console.log(towardsWall)
                  //Normal in the sense of perpendicular, UnNormalized  in the sense of retaining its length
                  var wallNormalVector_UnNormalized = [ballPoint[0]-collisionPoint[0], ballPoint[1]-collisionPoint[1]]

                  //not using this:
                  /*Now that the intersection has been found, find the angle between the velocity and the wall*/
                  /*Make sure the SIGNS OF ALL THESE ANGLES ARE CORRECT:*/
                  /*
                  angleBetweenVelocityAndXAxis = -Math.atan2(ballTrajectoryEquation.rise, ballTrajectoryEquation.run)
                  angleBetweenWallAndYAxis = Math.PI/2 - Math.atan2(wallExtensionEquation.rise, wallExtensionEquation.run)
                  angleBetweenWallAndXAxis = -Math.atan2(wallExtensionEquation.rise, wallExtensionEquation.run)
                  angleBetweenVelocityAndWall = angleBetweenVelocityAndXAxis-angleBetweenWallAndXAxis//Math.PI/2 - angleBetweenVelocityAndXAxis - angleBetweenWallAndYAxis
                  //angleBetweenWallAndXAxis = Math.PI/2 - angleBetweenWallAndYAxis
                  ballToIntersectionDistance = distanceBetween(ballPoint, intersection)


                  //console.log(angleBetweenVelocityAndWall*57.3)
                   //See diagrams //NOTE: ADD DIAGRAMS
                   distanceBetweenCollisionAndIntersection = ballToIntersectionDistance * Math.sin(Math.PI/2 + angleBetweenVelocityAndWall)

                   HoriDistanceBetweenCollisionAndIntersection = Math.sqrt(distanceBetweenCollisionAndIntersection*distanceBetweenCollisionAndIntersection /
                                                                          (wallExtensionEquation.m*wallExtensionEquation.m + 1))
                   //slope (m) = vertical-distance/horizontal-distance
                   VertDistanceBetweenCollisionAndIntersection = /*-/ABS?*/ /*wallExtensionEquation.m*HoriDistanceBetweenCollisionAndIntersection

                   collisionPoint = [intersection[0]-HoriDistanceBetweenCollisionAndIntersection, intersection[1]-VertDistanceBetweenCollisionAndIntersection]*/


                  //this is being used though:
                  //Consider the following scenario: the collisionPoint is not actually the closest point on the wall's extension. This happens when the ball collides with
                  // an endpoint of the wall. For these cases, set collisionPoint to the wall's endpoint:
                  var radPad = 0//par.userObstacleThickness
                  if(distanceBetween(ballPoint, wallPoint) <= rad+radPad) {
                    collisionPoint = wallPoint;
                    //treat the collision point as a small circle and collide off the tangent line. luckily, the vector normal to the tangent line
                    //has the same direction as that between the ballPoint and wallPoint(the collision point). it's magnitute doesn't matter because
                    //it will be normalized!
                    wallNormalVector_UnNormalized = [ballPoint[0]-collisionPoint[0], ballPoint[1]-collisionPoint[1]]
                  }
                  if(distanceBetween(ballPoint, nextWallPoint) <= rad+radPad) {
                    collisionPoint = nextWallPoint;
                    //get the new normal
                    wallNormalVector_UnNormalized = [ballPoint[0]-collisionPoint[0], ballPoint[1]-collisionPoint[1]]
                  }
                  //Check whether the collision point is actually within the wall and not just in its extension
                    //collision padding - how far away a ball needs to be from an obstacle for it to collide:
                    var obColPad = 0//par.userObstacleThickness
                  var collisionIsWithinSegment = (collisionPoint[0] >= Math.min(wallPoint[0], nextWallPoint[0])-obColPad) &&
                                             (collisionPoint[0] <= Math.max(wallPoint[0], nextWallPoint[0])+obColPad) &&
                                             (collisionPoint[1] >= Math.min(wallPoint[1], nextWallPoint[1])-obColPad) &&
                                             (collisionPoint[1] <= Math.max(wallPoint[1], nextWallPoint[1])+obColPad)


                  //The ball can be touching the wall even if it doesn't intersect, so we need to find the distance to the closest point on the wall:
                  //The line between this and the ball is always pi/2 radians from the ball, so we can use the sin:

                  var ballToWallClosestDistance = distanceBetween(collisionPoint, ballPoint)


                  var ballWithinLineRange = false
                  if(Math.abs(ballToWallClosestDistance) < rad){
                    ballWithinLineRange = true
                  }

                  //view.showPoint(collisionPoint)
                  //console.log(angleBetweenVelocityAndWall*57.3)
                  //alert(ballToWallClosestDistance + ", " + collisionIsWithinSegmentPlusBallRadius + ", " + ballWithinLineRange + ", " + collisionPoint)
                  //if(!collisionIsWithinSegment && ballWithinLineRange){console.log(collisionPoint)}


                  if(collisionIsWithinSegment && ballWithinLineRange){
                    //view.showPoint(collisionPoint)
                    return {collisionHappening: true, wallVector: wallVec, ballVector: ballVec, wallNormal: wallNormalVector_UnNormalized}
                  } else {
                    return {collisionHappening: false, wallVector: wallVec, ballVector: ballVec, wallNormal: wallNormalVector_UnNormalized}
                  }
                } else { //if it's not traveling towards the wall:
                  return {collisionHappening: false, wallVector: wallVec, ballVector: ballVec, wallNormal: wallNormalVector_UnNormalized}
              }

      }

      this.update = function(newTime){
       if(!this.frozen){ //don't update if it's frozen
        var timestepDuration = newTime - this.currentTime
        this.currentTime = newTime

        /*bad motion algorithm:
        //if it's in stochasticRobotPaths mode,
        //every 500ms (with 60ms leeway), give the balls random velocities between __ and __ in each direction - combine this with the next for loop if it works; they're the same thing)
        if((par.stochasticRobotPaths || par.classicMode) && Math.round(newTime % 500 < 60)){
          for(var i = 0, numBalls = this.balls.length; i < numBalls; i++){
            this.balls[i].setVelocity([0.24*(Math.random()-0.5), 0.24*(Math.random()-0.5)])
          }
        }*/
        //Checks for collision with the four walls surrounding the game, NOT user-defined obstacles/walls
        this.executeWallCollisions = function(){

        for(var i = 0, numBalls = this.balls.length; i < numBalls; i++){

          var ball = this.balls[i];
          var ballPoint = [ball.getX(), ball.getY()]

          var collisionRadius = ball.getRadius() + this.wallThickness //greatest distance that can trigger a collision

          var collisionLeftWall = ballPoint[0]-collisionRadius <= 0
          var collisionRightWall = ballPoint[0]+collisionRadius >= w
          var collisionTopWall = ballPoint[1]-collisionRadius <= 0
          var collisionBottomWall = ballPoint[1]+collisionRadius >= h

          var vel = ball.getVelocity()
          //flip motion in x-direction IF it's touching the left or rigth wall and going towards the respective wall: (sometimes, balls can end up too far inside the wall,
          //and their velocity gets constantly flipped and they don't escapE
          if((collisionLeftWall && vel[0] < 0) || (collisionRightWall && vel[0] > 0)){
            ball.collide("wall")
            ball.setVelocity([-vel[0], vel[1]])
          }
         //IF MULTIPLE COLLISIONS IN ONE UPDATE ARE A PROBLEM, PUT AN ELSE HERE
          if((collisionTopWall && vel[1] < 0) || (collisionBottomWall && vel[1] > 0)) {
            //flip motion in y-direction
            ball.collide("wall")
            ball.setVelocity([vel[0], -vel[1]])
          }

          /*NOT USING THIS INEFFICIENT WALL-COLLISION DETECTION ALGORITHM:
          for(var k = 0, numWalls = this.walls.length; k < numWalls; k++){

            var wall = this.walls[k]


            var wallX = wall.getX()
            var wallY = wall.getY()
            var wallL = wall.getL()
            var wallW = wall.getW()


            var rad = ball.getRadius()

            //var bh = ball.highestPoint()
            //var bl = ball.lowestPoint()
            //var be = ball.leftestPoint()
            //var br = ball.rightestPoint()

            var wh = wall.highestSide()
            var wl = wall.lowestSide()
            var we = wall.leftestSide()
            var wr = wall.rightestSide()


            //NOTE: you can increase the padding for better performance withhigher velocities
            var padding = 0
            function oneDimDistance(a,b) {return Math.abs(a-b)} //his is just encapsulation of a simple but soon-to-be frequently used procedure

            var closestSideOfWallVertically = (oneDimDistance(ballPoint[1], wh) < oneDimDistance(ballPoint[1], wl)) ? wh : wl

            var closestSideOfWallHorizontally = (oneDimDistance(ballPoint[0], we) < oneDimDistance(ballPoint[0], wr)) ? we : wr

            var closestVertDistance = oneDimDistance(ballPoint[1], closestSideOfWallVertically)
            var closestHoriDistance = oneDimDistance(ballPoint[0], closestSideOfWallHorizontally)

            if(closestVertDistance <= rad+padding || closestHoriDistance <= rad+padding){
              ball.collide("wall");
              //multiply the velocity by -1 on appropriate axis. but how do we find the appropriate axis?:
              //by looking for the side of the wall the ball is closest to

                var closestWall = "both" //default value. this is usefeul when the ball collides with both at the same time (which is very rare)

                if(closestVertDistance < closestHoriDistance){
                  closestWall = "vert"
                } else if(closestHoriDistance < closestVertDistance){
                  closestWall = "hori"
                }

                //now, find and set the ball's velocity
                var vel = ball.getVelocity()
                switch(closestWall){
                case "vert":
                  ball.setVelocity([vel[0], -vel[1]])
                  break
                case "hori":
                  ball.setVelocity([-vel[0], vel[1]])
                  break
                case "both":
                  ball.setVelocity([-vel[0], -vel[1]])
                  break

                }

              //move the ball one increment after setting its velocity (or leaving it):
            }
          }*/
          }
        }


        this.executeObstacleCollisions = function(){
          //iterate through all the balls and pixels (except last pixel because there will be no line drawn from it):
          for(var i = 0, numBalls = this.balls.length; i < numBalls; i++){
            var ball = this.balls[i]
            var rad = ball.getRadius()
            var ballPoint = [ball.getX(), ball.getY()]
            var ballVec = ball.getVelocity()
            var ballTrajectoryEquation = equationFromPointAnd2dVec(ballPoint, ballVec)

            for(var o = 0, obs = this.userObstacles, numObs = obs.length; o<numObs; o++){
              var ob = obs[o]
              //uncomment? for(var j = 0, pix = ob.getPixels(), numPix = pix.length; j<numPix-1; j++){
                //compute distance between ball center and closest point on wall:
                  //first find intersection of ball velocity vector and wall:
                    //step 1. compute equations of lines (in slope-intercept form)

                    //uncomment these? or delete, we'll see
                      /*wallPoint = pix[j]
                      nextWallPoint = pix[j+1]
                      wallVec = [nextWallPoint[0]-wallPoint[0], nextWallPoint[1]-wallPoint[1]]
                      wallExtensionEquation = equationFromPointAnd2dVec(wallPoint, wallVec)

                      intersection = intersectionOf2Equations(ballTrajectoryEquation,wallExtensionEquation)
    */
                      var collisionData = this.ballAndObstacleCollisionStatus(ball,ob)

                      if(collisionData.collisionHappening){
                        //there's a collision
                        ball.collide("userObstacle")

                        //the wallNormalVector_UnNormalized vector's magnitude will need to be calculated
                        var wallNormalVector_UnNormalized = collisionData.wallNormal
                        var wallNormalVectorUnNormalizedMagnitude = Math.sqrt(wallNormalVector_UnNormalized[0]*wallNormalVector_UnNormalized[0] + wallNormalVector_UnNormalized[1]*wallNormalVector_UnNormalized[1])
                        var ballToWallClosestDistance = wallNormalVectorUnNormalizedMagnitude

                        //sometimes, the balls can end up in the walls. The user should be allowed to draw walls through balls,
                        //and the balls can occasionally find their way into walls. In these cases, balls should just pass through
                        //and their velocities should not be changed.
                        //This function will still try to chenge the balls' velocities and treat them as if they were normal ball
                        //that aren't already within obstacles. But the balls will block this change if they are within an obstacle
                        var ballIsInsideWall = Math.abs(ballToWallClosestDistance) + 5 < rad //5px are given as leeway
                        if(!ballIsInsideWall){
                        //perform collision bounceback:
                        //According to https://www.3dkingdoms.com/weekly/weekly.php?a=2, resulting velocity vector = -2*(V dot N)*N + V, where V is the velocity and N is the normalized normal vector
                        var wallNormalVector_Normalized = [wallNormalVector_UnNormalized[0]/wallNormalVectorUnNormalizedMagnitude, wallNormalVector_UnNormalized[1]/wallNormalVectorUnNormalizedMagnitude]
                        var velocityVector = collisionData.ballVector
                        var negativeTwoTimesDotP = -2*dot(velocityVector, wallNormalVector_Normalized)
                        var resultingVelocity = [wallNormalVector_Normalized[0]*negativeTwoTimesDotP+velocityVector[0], wallNormalVector_Normalized[1]*negativeTwoTimesDotP+velocityVector[1]]

                        ball.setVelocity(resultingVelocity, "userObstacle")
                        //  this.color = "red"//"#"+((1<<24)*Math.random()|0).toString(16)
    /*not using:
                          angleBetweenResultingVelocityAndXAxis = angleBetweenWallAndXAxis - angleBetweenVelocityAndWall
                          alert(angleBetweenWallAndXAxis + "," + angleBetweenVelocityAndWall)
                          console.log(angleBetweenWallAndXAxis*57.3)
                          //now, we know the angle of the velocity. we just need the magnitute:
                          velMagnitude = Math.sqrt(ballVec[0]*ballVec[0] + ballVec[1]*ballVec[1])
                          resultingVelXComponent = velMagnitude*Math.cos(angleBetweenResultingVelocityAndXAxis)
                          resultingVelYComponent = velMagnitude*Math.sin(angleBetweenResultingVelocityAndXAxis)
                          ball.setVelocity([resultingVelXComponent, resultingVelYComponent])*/
                      }
                    }

                      }
                    }
                }

        this.executeWallCollisions()
        this.executeObstacleCollisions()
        //move the balls
        for(var i = 0, numBalls = this.balls.length; i < numBalls; i++){
          this.balls[i].move(timestepDuration)
        }

      }
     }

     this.checkDefusalGuess = function(clickPoint){
       //alert("Checkin'")
        var clickIsInABall = false
        var balls = curLevel.model.getBalls()
        for(var k = 0, numBalls = balls.length; k < numBalls; k++){
          if(distanceBetween(clickPoint, [balls[k].getX(), balls[k].getY()] ) <= balls[k].getRadius()){
            var guessedBall = balls[k]
            var clickIsInABall = true
            if(curLevel.controller.ballWasAlreadyGuessed(guessedBall)){
              curLevel.view.showTextOnBottom("you already guessed that robot. maybe we should have somebody else defuse these bombs who can remember")

            } else if(guessedBall.explosive){
              curLevel.controller.addGuessedBall(guessedBall)
              return true
            }
          }
        }
        //after iterating through all of them and none of them beign correct guesses (because correct guesses would have resulted in return true)
        if(clickIsInABall){
          curLevel.controller.addGuessedBall(guessedBall)
          return false
        } else {return "notABall"}
      }
}



    //constructor for balls: (x and y are initial position)
    function ball(x, y, radius, speed, id, isExplosive) {
      this.id = id
      this.occluded = false //only used for implosion/explosion/teleportation occlusion
      this.collisionsEnabled = true //collisions allowed
      this.colliding = false
      this.obstacleSegmentsIAmInsideOf = []
      //segment is of form [segmentStart, segmentEnd]
      this.isWithinObstacleSegment = function(segment){
        //if it's colliding, it's "inside" for all practical purposes -
        //if it's colliding during obstacle creation, it should pass through the obstacle segment it's inside of
        return curLevel.model.ballAndObstacleSegmentCollisionStatus(this,segment).collisionHappening
      }

      this.respondToObstacleSegmentCreation = function(segment) {
        //Only say the ball is inside an obstacle if it is inside when the obstacle is created! Otherwise, there's no reason for the ball to be inside:
        if(this.isWithinObstacleSegment(segment) && !this.obstacleSegmentsIAmInsideOf.includes(segment)){this.obstacleSegmentsIAmInsideOf.push(segment)}
      }
      this.imgElement = new Image();
      this.imgElement.src = "robomb-pngs/robot-normal.png";

      this.setImage = function(imgpath, callback) {
        this.imgElement.src=imgpath
        this.imgElement.onload = function(){
          if(callback !== undefined){callback()}
        }
      }
      this.getColor = function() {return this.color}
      this.setColor = function(col) {this.color = col}
      this.explosive = (isExplosive == "e")
      this.collide = function(collisionType){
        this.colliding = true
        if(!this.collisionsEnabled){
        } else if(collisionType == "wall" && this.explosive){
          //if it's in lives mode, have it decrement a life.
          if(par.lives){
            curLevel.model.decrementLives(/*callback:*/function(){curLevel.view.showLives(curLevel.model.lives)})
          }
          curLevel.defusalMode(); //COMMENT THIS TO DISABLE DEFUSAL MODE
        } else if(collisionType == "userObstacle"){

        }
                                     //obstaclesSegmentsIAmInsideOf must be empty so it doesn't register a collision when it's inside
        if(this.collisionsEnabled && this. obstacleSegmentsIAmInsideOf.length < 1){ //it seems unecessary to have this type of if statement with
                                    //collisionsEnabled twice but I couldn't exit the function in the previous if statement to prevent
                                    //this line from happening: (returning in that earlier conditional didn't actually exit the overall function)

          this.onCollide(collisionType);
        }
      }
      this.onCollide = function(collisionType){
        //setTimeout(function(){b.collisionsEnabled = false}, 10)
        //setTimeout(function(){b.collisionsEnabled = true}, 100)
        //this.color = "#FF0000"
        if(collisionType == "wall") {
          this.wallCollideAnimation.showAnimation(this.x, this.y)
        } else if (collisionType == "userObstacle") {
          this.userObstacleCollideAnimation.showAnimation(this.x, this.y)
        }
      }
      this.wallCollideAnimation = (this.explosive) ? new wallExplodeAnimation() : new emptyAnimation()
      this.userObstacleCollideAnimation = new userObstacleCollideAnimation()
      this.occluderEnterAnimation = par.classicMode ? new emptyAnimation() : new teleportBeginAnimation()
      this.occluderExitAnimation = par.classicMode ? new emptyAnimation() : new teleportEndAnimation()

      this.callWallCollideAnimation = function(){this.implodeAnimation.showAnimation(this.x, this.y)}
      this.callObstacleAnimation = function(){this.explodeAnimation.showAnimation(this.x, this.y)}
      this.callOccluderEnterAnimation = function(){this.occluderEnterAnimation.showAnimation(this.x, this.y)}
      this.callOccluderExitAnimation = function(){this.occluderExitAnimation.showAnimation(this.x, this.y)}

      this.radius = radius
      this.getRadius = function(){return this.radius}
      //all balls must have the same speed but random direction: therefore their:
      //x velocity = their speed*cos(random angle), y velocity: speed*sin(same angle)

      var randomAngle = Math.random()*2*Math.PI
      this.velocity = [speed*Math.cos(randomAngle), speed*Math.sin(randomAngle)]
      this.x = x//Math.random()*view.gameWidth
      //this.x_prev = null, //previous position is important to calculate angle of movement
      this.y = y//Math.random()* view.gameHeight
      //this.y_prev = null
      this.getX = function(){return this.x};
      this.getY = function(){return this.y};
      //this.getPrevX = function(){return this.x_prev};
      //this.getPrevY = function(){return this.y_prev};

      this.setX = function(new_x){
        //this.x_prev = this.x
        this.x = new_x
      }
      this.setY = function(new_y){
        //y_prev = this.y
        this.y = new_y
      }


      this.getVelocity = function(){return this.velocity};
      //collisionType is optional parameter but should be used during any collision, especially those with user obstacles so it knows to collide off them
      this.setVelocity = function(v, collisionType){
          //don't allow setting velocity if ball is inside an obstacle.
          //let the velocity stay the same until it exits the obstacle. it should only be in an obstacle if the obstacle was created over the ball
          for(var p=0; p<this.obstacleSegmentsIAmInsideOf.length; p++){
            var segment = this.obstacleSegmentsIAmInsideOf[p]
            //if it's no longer within the obstacle:
            if(!this.isWithinObstacleSegment(segment)){
              //remove the obstacle from the array:
              var idx = this.obstacleSegmentsIAmInsideOf.indexOf(segment)
              this.obstacleSegmentsIAmInsideOf.splice(idx,1)
            }
          }

          //now, set the velocity iff it's not within any obstacles (it should smoothly pass through obsacles it's already within, and it should only be
          //within them if they were created on top of it), and if collisions are enabled. Otherwise, if it's not colliding with a user obstacle, it can be set regardless.
          if((this.obstacleSegmentsIAmInsideOf.length < 1 && this.collisionsEnabled) || collisionType != "userObstacle"){
            this.velocity = v; /*console.log("setting velocity")*/} /*else{console.log("setting velocity blocked" + this.obstacleSegmentsIAmInsideOf.length)}*/

      }


      this.highestRow = function(){return this.y - this.radius}
      this.lowestRow = function(){return this.y + this.radius}
      this.leftestColumn = function() {return this.x - this.radius}
      this.rightestColumn = function() {return this.x + this.radius}

      //move the ball one increment accorsing to its current velocity and position:
      this.move = function(timestepDuration){
        var td = Math.abs(timestepDuration)
        //account for strange timestepDuration values like 0 or very high values:
        if(td == 0 | td > 40){ //above 40 (25fps) can be buggy - balls move through obstacles in one frame
          td = 33 //maybe it should be set to 40? but 33 looks good on my screen. maybe td > 40 shoudl read td > 33
        }
        //var stuckInWall = this.x-this.radius < 0 || this.x+radius > w || this.y-this.radius < 0 || this.y-this.radius > h

        //only do the following modifications to acceleration and velocity if allowed (they will NOT be allowed in a frame where the ball
        //is colliding.
        if(!this.colliding){
          if(par.stochasticRobotPaths){
            pfsrp = par.parametersForStochasticRobotPaths
            //Equation for velocity and acceleration taken from Vul, Frank, and Tenenbaum (2009), producing an Ornstein-Uhlenbeck process: (some modifications are here:
            //the velocity is multiplied by velocityMultipler and force fields such as in Scholl & Pylyshyn (1999)). Acceleration is also disabled upon collision.
            var acceleration = this.colliding ? 0 : [randGaussian(0,pfsrp.accelerationStandardDeviation), randGaussian(0,pfsrp.accelerationStandardDeviation)]
            var velocity =[ (pfsrp.inertia*this.velocity[0] - pfsrp.springConstant*(par.gameWidth/2-this.x) + acceleration[0]),
                            (pfsrp.inertia*this.velocity[1] - pfsrp.springConstant*(par.gameHeight/2-this.y) + acceleration[1])
                          ]
            if(par.forceFields){
              var forceFieldVector = [0,0];
              var itemsWithFields = []
              //balls should have fields
              itemsWithFields.push.apply(curLevel.model.getBalls())
              if(par.borderWallsHaveForceFields){
                //add x and y value for walls. these will make the balls avoid walls
                itemsWithFields.push({x:0,y:0}, {x:w,y:h})
              }
              //calculate force field by the distance between this robot/ball and other robot/balls. iterate through every ball:
              for(var r = 0, numItemsWFields = itemsWithFields.length; r < numItemsWFields; r++){
                //add the x and y squared distances to their respective components in the vector. At the end of the loop, the resulting vector will be:
                //[sum of every 1/(x-distances squared), sum of every 1/(y-distances squared)]

                var xDistance = this.x-itemsWithFields[r].x
                var yDistance = this.y-itemsWithFields[r].y
                //prevent extremely close distances which lead to ridiculously big force fields
                var distanceForForcefieldLimit = 2

                if(xDistance < distanceForForcefieldLimit){
                  xDistance = distanceForForcefieldLimit
                }
                if(yDistance < distanceForForcefieldLimit){
                  yDistance = distanceForForcefieldLimit
                }

                //prevent dividing by zeros:
                if(!(xDistance == 0 || yDistance == 0)){
                  forceFieldVector[0] += par.forceFieldStrength/(xDistance*xDistance)
                  forceFieldVector[1] += par.forceFieldStrength/(yDistance*yDistance)
                  velocity[0]+=forceFieldVector[0]
                  velocity[1]+=forceFieldVector[1]
                  //for performance, forceFieldVector could be elimated and velocity added directly to instead
                }
            }
          }
            velocity[0]*=pfsrp.velocityMultipler
            velocity[1]*=pfsrp.velocityMultipler
            this.setVelocity(velocity)
          }
      } else {//if the ball is colliding:
        this.colliding = false //it's about to uncollide because it's velocity has been set by whatever called move:
      }

        /*update x-axis position using differential equation dx/dt = v_x*/
        var dx = this.getVelocity()[0] * td
        this.setX(this.x+dx)
        var dy = this.getVelocity()[1] * td
        this.setY(this.y+dy);

        //if it's in implode and explode mode, have it implode if it's inside an occluder and explode til it's at the normal radius if it's outside
        if(par.implodeExplodeMode && !curLevel.defusalModeOn){
          if(circleIsInAnOccluder([this.x, this.y], this.radius)){
            if(!this.occluded){this.callOccluderEnterAnimation(); this.occluded = true} //have it do the occluder enter animation if it's not already occluded
         }else {
            if(this.occluded){this.callOccluderExitAnimation(); this.occluded = false}
         }
      }
    }

  }


    function emptyAnimation(){
        this.showAnimation = function(x,y){ };
    }

    /*TODO: make an animation class and subclass these. I don't know enough about JS classes to do that easily*/
    function wallExplodeAnimation(){
        var img = "explosion.png"
        var duration = 2000
        this.showAnimation = function(x,y) {curLevel.view.showImgAtFor(img, x, y, duration)}
    }

    function userObstacleCollideAnimation(){
        this.animationCoolDownTime = 100;
        var img = "obstacoll.png"
        var duration = 200
        this.animationAlreadyDisplayed = false
        this.showAnimation = function(x,y) {
          /*if(!this.animationAlreadyDisplayed){
            //don't allow for simultaneous animations for the same userObstacleCollisionAnimation object
            this.animationAlreadyDisplayed = true
            curLevel.view.showImgAtFor(img, x, y, duration, {objectToNotifyWhenDoneDisplaying: this})
          }
        */}
        //gets called when showImgAtFor is done (this is passed as an argument, objectToNotifyWhenDoneDisplaying, for showImgAtFor)
        this.respondToImageBeingCleared = function(){this.animationAlreadyDisplayed=false}
    }

    function teleportBeginAnimation(){
      this.img = "teleportbegin.png"
      this.animationDuration = 550

      this.animationAlreadyBeingDisplayed = false

      this.showAnimation = function(x,y){
        if(!this.animationAlreadyDisplayed){
          //don't allow for simultaneous animations for the same userObstacleCollisionAnimation object
          this.animationAlreadyDisplayed = true
          curLevel.view.showImgAtFor(this.img, x, y, this.animationDuration, {objectToNotifyWhenDoneDisplaying: this})
        }
      }

      this.respondToImageBeingCleared = function(){this.animationAlreadyDisplayed=false}
    }

    function teleportEndAnimation(){
      this.img = "teleportend.png"
      this.animationDuration = 550

      this.animationAlreadyBeingDisplayed = false

      this.showAnimation = function(x,y){
        if(!this.animationAlreadyDisplayed){
          //don't allow for simultaneous animations for the same userObstacleCollisionAnimation object
          this.animationAlreadyDisplayed = true
          curLevel.view.showImgAtFor(this.img, x, y, this.animationDuration, {objectToNotifyWhenDoneDisplaying: this})
        }
      }

      this.respondToImageBeingCleared = function(){this.animationAlreadyDisplayed=false}
    }

  //function wall(x,y/*top left x and y*/, w, l/*length and width*/){
  /*
      this.x = x;
      this.y = y;
      this.w = w;
      this.l = l;

      this.getX = function(){return x}
      this.getY = function(){return y}
      this.getL = function(){return l}
      this.getW = function(){return w}

      this.highestSide = function(){return y}
      this.lowestSide = function(){return y+l}
      this.leftestSide = function(){return x}
      this.rightestSide = function(){return x+w}
    }*/

    function userObstacle() {
      this.pixels = new Array(),
      this.maxPixels = par.maxUserDefinedObstacleSegments+1,
      this.radius = par.userObstacleThickness+7,
      this.minDistanceBetweenPixels = par.minDistanceBetweenObstaclePixels,
      this.maxDistanceBetweenPixels = par.maxDistanceBetweenObstaclePixels,
      //minDistanceToCallItSamePixelSquared: 300,
      this.pixelLimitExceeded = false,

      this.addPixels = function(event){

        //TRICK: in replay mode, a custom fake event object is passed to this fuction. The fake event object doesn't have all the parameters of a mousemove event,
        //but it has an x and y coordinate and an additional isFromReplay: true. These x and y (from mousemove events at least, not mousedown because the mousedown
        //coordinates are collected before getting the point's relative position to the canvas) are not pageX and pageY; they are coordinates relative to the canvas

        //so, the point's position on the canvas determined accordingly:
        var pos = null
        if(event.isFromReplay !== undefined && event.type == "mousemove"){
          pos = [event.x, event.y]
        } else{
          pos = getPixelPositionRelativeToObject([event.pageX, event.pageY], curLevel.view.mainCan)
        }
        //if there are no existing pixels/points, just add it without the for loop
        var numPix = this.pixels.length;
        if(numPix == 0){
          this.pixels.push(pos)
          return; //break it so the function doesn't try to add the value again
        }

        var validPosition = true
        //add them if they're far enough from the previous pixels.
        for(var l=0; l<numPix; l++){
          var dist = distanceBetween(pos, this.pixels[l])

          if(dist < this.minDistanceBetweenPixels || dist > this.maxDistanceBetweenPixels ||
            /*the slope also cannot be perfectly vertical/undefined! nor perfectly horizontal!: */
            this.pixels[l][0] == pos[0] || this.pixels[l][1] == pos[1]){
            //console.log(pixels[l][0], event.pageX)
            validPosition = false;
            break;
          }
        }
        //don't allow a wall being drawn through a ball:
        for(var l=0, balls = curLevel.model.getBalls(), numBalls = balls.length; l<numBalls; l++){
          var ball = balls[l]
          var mostRecentPixel = (this.pixels.length == 0) ? pos : this.pixels[this.pixels.length-1]
          if(ball.isWithinObstacleSegment([this.pixels[this.pixels.length-1]/*last pixel*/, pos/*this pixel*/])){
            validPosition = false;
            if(!this.imageDisplayCooldownPeriod){
              //curLevel.view.showImgAtFor("x.png", ball.getX(), ball.getY(), 350, {objectToNotifyWhenDoneDisplaying: this})
              //this.imageDisplayCooldownPeriod = true
            }
            break;
          }
        }

        if(validPosition){
            this.pixels.push(pos)
            data.createdPoints.push(
              {position: pos,
               timeCreated: event.timeStamp - timestampWallCreationEnabled,//make timeCreated the event's time relative to the time wall creation was initially enabled
               eventType:event.type //mousedown events create new obstacles; mousemove events add points to them
            })
            //alert the balls of the new user obstacle, now that it has changed (it doesn't matter that excess wall's haven't been removed yet -
            //they are being alerted so they don't collide if inside the new segment and existing obstacle if they're already inside. if they don't
            //collide with the old segment either that's fine)
            var balls = curLevel.model.getBalls()
            for(var q = 0, numOfBalls = balls.length; q < numOfBalls; q++){
              var numPix = this.pixels.length
              lastPixel = this.pixels[numPix - 1]
              secondToLastPixel = (numPix > 1) ? this.pixels[numPix -2] : this.pixels[numPix - 1]
              balls[q].respondToObstacleSegmentCreation([lastPixel, secondToLastPixel])
            }
          }
        while(this.pixels.length > this.maxPixels){
            //console.log(this.pixels)
            this.pixels.shift() //get rid of the first element
            //console.log(this.pixels)
        }
      }

    /*
        if(([event.pageX, event.pageY]){} //if(this.pixels.length == this.maxPixels){
          this.pixels.push([event.pageX, event.pageY])
        } else if (this.pixels.length >= this.maxPixels) {
          //if this is the first time exceeding the pixel limit:
          if(!this.pixelLimitExceeded){
            view.message("You can't use too much wall... that would make it easy")
            //set it to true so this message only displays once:
            this.pixelLimitExceeded = true;
          }


        }
      },*/

      this.getPixels = function(){return this.pixels}
      this.getRadius = function(){return this.radius}
      this.imageDisplayCooldownPeriod = false
      this.respondToImageBeingCleared = function(){this.imageDisplayCooldownPeriod = false}
      //this.atMaxLength() = function(){return this.pixels.length == this.maxPointsInWall}
    }

    function view(mod) {
      this.model = mod
      this.currentTime = 0
      //get canvas, context
      this.can = null
      this.ctx = null
      this.highlightingSelectedBalls = false
      this.pointsToShow = new Array(),
      this.showPoint = function(pt) {this.pointsToShow.push(pt)}

      this.initialized = false
      this.init = function(){
        this.mainCan = document.getElementById('mainCanvas')
        this.mainCtx = this.mainCan.getContext("2d")
        this.initialized = true
      }

      this.showInitialFrame = function(mod, initialFrameDuration){
        //just call view's update function once. However, the exploding balls' colors must be changed first.
        //change the exploding balls' colors:
        for(var j = 0, balls = mod.explodingBalls, numBalls = balls.length; j < numBalls; j++){
          var ball = balls[j];
          //make the callback of the last setImage  this.update(), so that it doesn't update til all the images are loaded
          if(j == numBalls - 1){
            var thisView = this
            ball.setImage("robomb-pngs/robot-bomb.png", function(){thisView.update(mod)})
          } else {
            ball.setImage("robomb-pngs/robot-bomb.png")
            //alert(duration)
          }

        var bdimg = new Image()
        bdimg.src = 'robomb-pngs/bomb-detected.png'
        //set the width and height:
        var width = 0, height = 0
        bdimg.onload = function(){
          width = bdimg.width, height = bdimg.height
        }
        //show it
        this.showImgAtFor('robomb-pngs/bomb-detected.png', w/2-width/2, h/2-height/2, initialFrameDuration)
        //this.update(mod)
        this.showLives(mod.lives)
        }

        //set timeout for what happens after the initial frame is over:
        setTimeout(curLevel.model.resetAllBallDesigns, initialFrameDuration)

        //show the occluder images:
        if(par.occludersEnabled){
          this.showOccluders(mod.getOccluderRects());
        }
      }

      this.showBalls = function(balls){
        var ctx = this.mainCtx
        //Iterate through the balls and display their current attributes:
        for(var j = 0, numBalls = balls.length; j < numBalls; j++){
          var ball = balls[j];
          if(!ball.occluded){
            var color = ball.getColor()
            ctx.beginPath();
            ctx.fillStyle = color
            //ctx.arc(ball.getX(), ball.getY(), ball.getRadius(), 0, 2*Math.PI);
            //ctx.fill();
            ctx.drawImage(ball.imgElement, ball.x-ball.imgElement.width/2+4, ball.y-ball.imgElement.height/2+4);

            ctx.closePath();
          }
        }
      }
      this.showWalls = function(wallThickness){
        var ctx = this.mainCtx
        //not using commented parts anymore:
        //for(var j = 0, numWalls = 4; j < numWalls; j++){
          //var wall = model.walls[j];
          var color = "green"
          ctx.beginPath();
          ctx.fillStyle = color
          //ctx.rect(wall.getX(), wall.getY(), wall.getW(), wall.getL())
          ctx.rect(0,0,wallThickness, h)
          ctx.rect(0,0,w,wallThickness)
          ctx.rect(w-wallThickness,0,wallThickness,h)
          ctx.rect(0,h-wallThickness,w,wallThickness)
          ctx.fill();
          ctx.closePath();
        //}
      }
      this.showObstacles = function(obstacles){
        var ctx = this.mainCtx
        //display the points/pixels in the user-defined wall as circles and draw line segments between them (except for before the first and after the last pixel)
        for(var j = 0, obs = obstacles, numObs = obs.length; j<numObs; j++){
          var ob = obs[j]
          for(var o = 0, pix = ob.pixels, numPix = pix.length, rad = ob.getRadius(); o<numPix; o++){
            //get x and y values of the pixel
            var x = pix[o][0]
            var y = pix[o][1]

            var color = "#2CFFCF"
            //draw circles of radius rad around each pixel
            ctx.beginPath()
            ctx.fillStyle = color
            //ctx.arc(x, y, rad, 0, 2*Math.PI)
            //ctx.fill()
            ctx.fillRect(x-rad/2,y-rad/2,rad,rad)

            //then draw a line from the pixel to the next pixel (if the next pixel exists)
            if(o < numPix-1){
              var color = "#2CFFCF"
              ctx.strokeStyle = "#2CFFCF"
              ctx.lineWidth = par.userObstacleThickness
              ctx.moveTo(pix[o][0], pix[o][1])
              ctx.lineTo(pix[o+1][0], pix[o+1][1])
              ctx.stroke();
            }

            ctx.closePath()

          }
        }
      }

      this.update = function(mod, newTime){
        var timestepDuration = newTime - this.currentTime
        this.currentTime = newTime

        if(this.initialized){
          //var can = this.can;
          var ctx = this.mainCtx; //easier to work with than having to write this.ctx each time
          //clear the context:
          ctx.clearRect(0,0, w, h);

          this.showBalls(mod.getBalls())
          //this.showWalls(par.wallThickness)
          this.showObstacles(mod.userObstacles)



          //show the points the showPoint() added to this.pointsToShow:
          for(var j = 0, pix = this.pointsToShow, numPix = pix.length; j<numPix; j++){
            var x = pix[j][0]
            var y = pix[j][1]

            var color = "black"
            //draw circles of radius rad around each pixel
            ctx.beginPath()
            ctx.fillStyle = color
            ctx.arc(x, y, 3, 0, 2*Math.PI)
            ctx.fill()
            ctx.closePath();
          }
        }

        //show occluder maybe...
        //var numFramesInExperiment = par.duration/timestepDuration
        //this should be true par.avg_occluders_per_level times per level
        //if(Math.round(Math.random()*numFramesInExperiment/par.avg_occluders_per_level) == 0) {
        //  var oc = new occluder()
        //  oc.show()
        //}
      },

      //img is a path to the image file. options is an object: {objectToNotifyWhenDoneDisplaying: value, customContext: value}
      this.showImgAtFor = function(image, x, y, duration, options){
        var ctx = (options === undefined || options.customContext === undefined) ? document.getElementById("overlay").getContext('2d') : options.customContext
        console.assert(ctx instanceof CanvasRenderingContext2D)
        var imgElement = new Image();
        imgElement.src = image;

        var width = null, height = null;
        imgElement.onload = function(){
          width = imgElement.width, height = imgElement.height;
          ctx.drawImage(imgElement, x-width/2, y-height/2)
        }

        //clear it after the duration's up:
        setTimeout(function(){
          ctx.clearRect(x-width/2,y-height/2,width, height)
          if(options !== undefined && options.objectToNotifyWhenDoneDisplaying !== undefined){

            options.objectToNotifyWhenDoneDisplaying.respondToImageBeingCleared()
          }

        }, duration)
        //imgElement.style.position = "absolute"
        //imgElement.style.top = "300"
        //document.body.appendChild(imgElement);

      }

      this.showLives = function(lives){
        //lives is just a number saying how many lives there are, but it could easily be changed to an array with unique lives
        var img = new Image();
        img.src = "life.jpg"
        var width = null
        img.onload = function(){
          //clear the previous rect of lives:
          var ctx = document.getElementById("livesCanvas").getContext("2d")
          var topLifeCoordinate = 10
          ctx.clearRect(w/2-img.width*(lives+1)/2, topLifeCoordinate, (lives+1)*img.width, img.height)
          for(var j = 0; j < lives; j++){
            ctx.drawImage(img, w/2-img.width*(lives/2-j), topLifeCoordinate)
          }
        }
      }

      this.showOccluders = function(occluderRectangles){
        var ctx = document.getElementById("occluderCanvas").getContext("2d")
        var occluderPatternImg = new Image();
        occluderPatternImg.src = "occluders/occluderpattern.png"
        if(par.invisibleOccluders){
          occluderPatternImg.src = "occluders/background-color.png" //not the most efficient, we could just fill a color, but this is only called once per level.
        }
        var occluderPatter = null
        occluderPatternImg.onload = function(){
          occluderPattern = ctx.createPattern(occluderPatternImg, "repeat")
        }


        setTimeout(function(){ //setTimeout used because of onload delay
        //loop through occluder rectangles:
        for(var j = 0, rects = occluderRectangles, numRects = rects.length; j < numRects; j++){
          ctx.beginPath()
          ctx.fillStyle = occluderPattern
          ctx.rect(rects[j].x, rects[j].y+par.wallThickness, rects[j].width, rects[j].height-par.wallThickness*2)
          ctx.fill()
          //this.showImgAtFor(occs[j].imgPath, occs[j].x, occs[j].y, curLevel.timer.getTime(), {customContext:document.getElementById("occluderCanvas").getContext("2d")})
        }
        ctx.closePath()
      }, 100)}
      this.hideOccluders = function(){
        var ctx = document.getElementById("occluderCanvas").getContext("2d")
        ctx.clearRect(0,0,w,h)
      }


      //args is an object. Currently, it has one option: deflectionSuccessful (true or false), which if true will let defusal mode know to give a different message
      //since it displayed
      this.displayDefusalMessage = function(defusalTimeLimit, args){
        var ocan = document.getElementById("overlay")
        var octx = ocan.getContext('2d')
        if(args !== undefined && args.deflectionSuccessful){
          this.showTextOnBottom("You've held out until the robots could be quarantined. +1 life. However, they are set to go off soon. You have 10 seconds to defuse them by clicking the right ones. You have one defusal kit per bomb, so don't waste any.")
          curLevel.model.freeze()
          curLevel.controller.beginDefusalMode(defusalTimeLimit)
        } else {
          var text = "one of the bomb carrying robots hit a wall... message."
          var okButton = {imgUp: 'robomb-pngs/btn-okay-up.png',
                          imgDn: 'robomb-pngs/btn-okay-down.png',
                          onClick: function(){curLevel.view.closeAlertBox(); curLevel.controller.beginDefusalMode(defusalTimeLimit)},
                          activateWhenEnterPressed: true}
          //this.showTextOnBottom(text)
          curLevel.controller.beginDefusalMode(defusalTimeLimit)
          this.showAlertBox(text, [okButton])
        }

      }

      this.showAlertBox = function(messageTxt, buttons){
        var messageDiv = document.getElementById('messageBox') //there's already an element; it's properties just have to be adjusted and then it needs to be displayed
        var messImgEl = document.getElementById('messageImg')
        document.getElementById('msgText').innerHTML = messageTxt
        for(var i=0, l=buttons.length; i<l; i++){
          var button = buttons[i]
          var butt = document.createElement("img")
          butt.innerHTML = 'test'
          butt.style = style='position:absolute; display:inline; margin-left: 50%; margin-right: 50%; width: 10%'
          butt.src = button.imgUp
          butt.onclick = function(){butt.src = button.imgDn; butt.onload = function(){setTimeout(button.onClick, 90)}}
          messageDiv.appendChild(butt)
          if(button.activateWhenEnterPressed){document.addEventListener('keypress', function(e){if(e.keyCode == 13){butt.onclick()}})}
        }
        messageDiv.style.display = 'block'
      }

      this.showTextOnBottom = function(messageTxt){
        var msgEl = document.getElementById('bottomText').innerHTML = messageTxt
        document.getElementById('bottomScreenText').style.display = 'block'
      }



      this.closeAlertBox = function(){
        var messageDiv = document.getElementById('messageBox')
        messageDiv.style.display = 'none'
      }
      this.highlightSelectedBalls = function(event){
        var can = document.getElementById('selectionCanvas')
        var ctx = can.getContext('2d')
        //iterate through the balls to check whether the mouth is within them:
        var balls = curLevel.model.getBalls()
        for(var n = 0, numBalls = balls.length; n < numBalls; n++){
          var ball = balls[n]
          var selectionRadiusAddOn = 1
          var totalRadius = ball.getRadius()+selectionRadiusAddOn

          if(distanceBetween([event.pageX,event.pageY], [ball.getX(), ball.getY()]) < ball.getRadius()){
            //display a border around the ball
            ctx.beginPath()
            ctx.strokeStyle = "red"
            ctx.arc(ball.getX(), ball.getY(), totalRadius, 0, 2*Math.PI)
            ctx.stroke()
            ctx.closePath();

          } else {
            //clear the rect aronud the ball
            var totalDiameter = totalRadius * 2
            ctx.beginPath()
            ctx.clearRect(ball.getX()-totalRadius-1, ball.getY()-totalRadius-1, totalDiameter+2, totalDiameter+2)
            ctx.stroke()
            ctx.closePath()
          }

        }


      }

      this.displayTimer = function(timer){
        var tctx = document.getElementById("timerCanvas").getContext("2d")
          if(timer.hidden){
            return null //exit the function if it's hidden, before the recursive call
          }
            if(!curLevel.defusalModeOn()){ //if it's not defusal mode, display the timer regularly
              //clear previously existing timer displays
              tctx.clearRect(timer.x-timer.fontSize,timer.y-timer.fontSize, timer.fontSize*2, timer.fontSize*2)
              tctx.font = timer.fontSize + "px Arial"
              //time = Math.round((this.curTime % 60000)/1000)
              var time = timer.getTime == null ? 0: Math.round(timer.getTime()/1000)
              tctx.fillStyle = timer.color
              tctx.textAlign = "center"
              tctx.fillText(time, timer.x, timer.y) //NOTE: assuming time counter should always be under a minute
            } else { //if it's defusal mode, display the big countdown:
              //clear previously existing timer displays
              tctx.clearRect(0,0,w, h)
              var time = timer.getTime == null ? 0: Math.round(timer.getTime()/1000)
              var ctdwnImgEl = new Image()
              var ctdwnImg = 'robomb-pngs/countdown-10.png'
              if(time < 10){
                ctdwnImg = 'robomb-pngs/countdown-0' + time + '.png'
              }
              ctdwnImgEl.src = ctdwnImg
              ctdwnImgEl.onload = function(){
                tctx.drawImage(ctdwnImgEl, w/2-ctdwnImgEl.width/2, h/2-ctdwnImgEl.height/2)
              }
            }

      }

      //clears all displays:
      this.clearView = function(){
        var canvii = document.getElementsByTagName("CANVAS")
        var ctxes = [];
        for(var canCounter = 0; canCounter < canvii.length; canCounter++){ctxes.push(canvii[canCounter].getContext('2d'))}
        for(var conCounter = 0; conCounter < ctxes.length; conCounter++){
          var ctx = ctxes[conCounter]
          var canWidth = canvii[conCounter].width
          var canHeight = canvii[conCounter].height
          ctx.clearRect(0,0,canWidth,canHeight);
        }
      }
    }

    function controller(model, view,levelDuration){

      this.gameOver = false
      this.defusalModeOn = false
      this.setDefusalModeOn = function(){this.defusalModeOn = true;}
      this.setDefusalModeOff = function(){this.defusalModeOn = false;}
      this.isGameOver = function(){return this.gameOver} //overdoing it on the getters, setters, and LoD? maybe
      this.beginGame = function(){

        var balls = curLevel.model.getBalls()
        for(var i = 0, l = balls.length; i<l; i++){
          var ball = balls[i]
          //push the important info from this ball to the data (so the replay can be constructed from initial conditions and interactions - note: this is not how replays will work anymore)
          data.ballInitialConditions.push(
                {
                   id: ball.id,
                   explosive: ball.explosive,
                   position: [ball.getX(), ball.getY()],
                   velocity:ball.getVelocity(),
                   radius: ball.getRadius()
               }
           )

        }
        curLevel.view.init();
        this.loadCanvas();

        var initialFrameDuration = 1300 //ms
        curLevel.timer.reset(levelDuration/1000, "green")
        curLevel.timer.start()
        curLevel.view.displayTimer(curLevel.timer)
        curLevel.view.showInitialFrame(model,initialFrameDuration) //show the frame where the exploding balls look different


        //now set what happens after the initial frame is over:
        setTimeout(function(){

            curLevel.timer.reset(levelDuration/1000, "green")
            curLevel.timer.start()
            curLevel.timer.unHide()
            //then start the first update
              //if(par.replayMode){
              //  replayModeUpdate(0);
              //} else{}
                updateGame(0); //beginning time is 0
              //}

            //grab the timestamp via the event loop to know when this piece of code gets executed. Timestamps may be more reliable than the timer class here,
            //and they doesn't get reset unless the document gets reloaded, unlike timers. Hence, timestamps are used for collection of user obstacle
            //creation times. The folloing code will execute whether replay mode is happening or not, and will allow for precise logging
            //of wall creation time, relative to the moment when wall creation is enabled.
            var wallCreationEnabledEvent = new Event("wallCreationEnabled")
            document.addEventListener("wallCreationEnabled", function(event){timestampWallCreationEnabled/*this should be global (within the plugin though)*/ = event.timeStamp}, false)
            document.dispatchEvent(wallCreationEnabledEvent)
            /*//collect time difference between now:
            var theTime = Date.now()
            //and ...(to be continued later, in the par.replayMode == true part of the following if)

            //if it's in replay mode, load the first frame
            if(par.replayMode){
              //if it's in replay mode, create the correct points.
              var pts = par.replayModeParameters.createdPoints
              //iterate through the points
              for(var i = 0, len = pts.length; i < len; i++){
                //create the point at the right time
                var pt = pts[i]
                //...(continued) now:
                var theNewTime = Date.now()
                var timeTilPointQueued = theNewTime-theTime //this was at most about 1ms on my laptop but may be significant on slower devices for more obstacles
                addReplayObstaclePointAfterTime(pt, pt.timeCreated-timeTilPointQueued/*subtracting it compensates for miniscule time lost going through all points)
              }


            } else { //if game isn't in replay mode*/
              curLevel.controller.getWallsFromUser() //this adds an event listener to get drawn walls from user.
            /*}*/
        }, initialFrameDuration)
        }




      this.ballHitBall = function(){console.log("Game Over")},

      this.loadCanvas = function(){this.can = document.getElementById("mainCanvas"); this.ctx = this.can.getContext("2d")},

      this.getWallsFromUser = function(){
        //first, add the event listener for mouseclicks
        document.addEventListener("mousedown", curLevel.controller.findWallDrawingPath);
      }

      this.findWallDrawingPath = function(event){
        //first, collect the first pixel:
        model.addPixelsToUserObstacles(event)

        document.addEventListener("mousemove", model.addPixelsToUserObstacles);
        //get rid of the mousemove listener when the mouse is released:
        document.addEventListener("mouseup", function(){document.removeEventListener("mousemove", model.addPixelsToUserObstacles); model.removeExcessObstacles()})

      }

      //this is an old function that should be replaced with displayDefusalMessage. Its job was to start defusal mode and display the message but now those happen at different times.
      //args is an object. Currently, it has one option: deflectionSuccessful (true or false), which if true will let defusal mode know to give a different message
      //since it displayed
      this.defusalMode = function(args){
        //only start defusalMode if it's not on already - this prevents it being triggered multiple times by collisions:
        if(!this.defusalModeOn){
          var defusalTimeLimit = 10000
          if(args !== undefined){
            curLevel.view.displayDefusalMessage(defusalTimeLimit, {deflectionSuccessful: args.deflectionSuccessful})
          } else {
            curLevel.view.displayDefusalMessage(defusalTimeLimit)
          }
          curLevel.view.hideOccluders()

          //view.displayTimer(curLevel.timer)



          /*setTimeout(function(){
            if(curLevel.controller.defusalModeOn){ //if the level hasn't been changed yet, the game's over after the timer's up //violation of LoD, maybe fix
              curLevel.controller.endGame()
            }},
          defusalTimeLimit)*/
        }

      }

      this.endDefusalMode = function(){
        document.removeEventListener("mousemove", curLevel.view.highlightSelectedBalls)
        document.removeEventListener("mousedown", this.registerDefusalGuess)
        curLevel.view.clearView()
      }

      this.beginDefusalMode = function(defusalTimeLimit){
        model.freeze()
        //first, show all occluded balls so users can guess them:
        var balls = curLevel.model.getBalls()
        for(var b = 0, l=balls.length; b < l; b++){
          if(balls[b].occluded){
            balls[b].occluded = false
            balls[b].callOccluderExitAnimation()
          }
        }
        curLevel.view.showBalls(balls)
        //remove the wall drawing listeners
        document.removeEventListener("mousedown", this.findWallDrawingPath)
        document.removeEventListener("mousemove", model.addPixelsToUserObstacles)

        //listen for new guesses:
        document.addEventListener("mousemove", curLevel.view.highlightSelectedBalls)
        document.addEventListener("mousedown", this.registerDefusalGuess)

        curLevel.controller.setDefusalModeOn()

        //start the timer
        curLevel.timer.reset(defusalTimeLimit/1000, "red", true)
        curLevel.timer.start()
      }

      this.guessesRemaining = model.numExplodingBalls()

      this.correctGuesses = 0
      this.incorrectGuesses = 0
      this.registerDefusalGuess = function(event){
        if(curLevel.controller.guessesRemaining > 0){
          var result = model.checkDefusalGuess([event.pageX, event.pageY])
          switch(result){
            case true: //correct guess
              curLevel.controller.correctGuesses++ //this looks like really bad OOP style but keep in mind it's happening within curLevel.controller
              curLevel.controller.guessesRemaining--
              curLevel.view.showImgAtFor("robomb-pngs/yep-medium.png", event.pageX, event.pageY, 1000)
              if(curLevel.controller.guessesRemaining == 0){
                  if(curLevel.controller.incorrectGuesses == 0){
                    curLevel.controller.endGame("defusalModeSuccess")
                  } else{
                    curLevel.controller.endGame("incorrectGuess")
                  }
              }
              break;
            case false:
              curLevel.controller.incorrectGuesses++
              curLevel.controller.guessesRemaining-- //-- instead of set to 0 because then we can collect data about how many the got right/wrong
              curLevel.view.showImgAtFor("robomb-pngs/nope-medium.png", event.pageX, event.pageY, 1000)
              //if this was their last guess:
              if(curLevel.controller.guessesRemaining == 0){
                curLevel.controller.endGame("incorrectGuess")
              }
              return null
              break;
            case "notABall":
              break;

          }

        } else { //if there are no guesses remaining:
          //this should never be called; the above cases should cover everything
          //remove the guessing event listeners
          //document.removeEventListener("mousedown", this.registerDefusalGuess)
          //document.removeEventListener("mousemove", curLevel.view.highlightSelectedBalls)

        }

      }

      this.guessedBalls = [];
      this.ballWasAlreadyGuessed = function(ball){return this.guessedBalls.includes(ball.id)}
      this.addGuessedBall = function(ball){this.guessedBalls.push(ball.id)}
      //minimalBallForm is set to true for data collection, when a smaller ball is saved with just the important parts. Ideally,
      //the balls would be made with UUIDs so they could be retrieved individually.
      this.getGuessedBalls = function(minimalBallForm){return this.guessedBalls}

      this.endGame = function(howGameEnded){
        curLevel.timer.hide()
        document.removeEventListener("mousedown", curLevel.controller.findWallDrawingPath)
        document.removeEventListener("mousemove", curLevel.model.addPixelsToUserObstacles)
        //maybe someday change to the state pattern
        switch(howGameEnded){
          case "defusalModeNeverHappened":
            data.defusalMode = "neverNeeded"
            data.defusalDuration = 0
            alert("Level Passed!");
            break;
          case "defusalModeTimeRanOut":
            data.defusalMode = "timeRanOut"
            data.defusalDuration = curLevel.timer.getTime() //this should be the length of defusal mode as long as the timer is reset before defusal mode begins
            alert("Out of time!");
            data.correctGuesses = curLevel.controller.correctGuesses
            data.incorrectGuesses = curLevel.controller.incorrectGuesses
            //maybe we can have it restart at the level before?
            break;
          case "incorrectGuess":
            data.defusalMode = "incorrectGuess"
            data.defusalDuration = curLevel.timer.getTime()
            data.correctGuesses = curLevel.controller.correctGuesses
            data.incorrectGuesses = curLevel.controller.incorrectGuesses
            alert("defusal mode failed. not all the guesses were correct; you wasted time trying to defuse the innocuous balls")
            curLevel.model.decrementLives(function(){curLevel.view.showLives(curLevel.model.lives)})
            //alert("Incorrect guess. Level failed.")
            //maybe we can have it restart at the level before?
            break;
          case "defusalModeSuccess":
            data.defusalMode = "successful"
            data.defusalDuration = curLevel.timer.getTime(true)
            data.correctGuesses = curLevel.controller.correctGuesses
            data.incorrectGuesses = curLevel.controller.incorrectGuesses
            alert("Level Passed!");
            break;
        }
        data.numLives = curLevel.model.lives
        curLevel.controller.endDefusalMode()
        curLevel.controller.gameOver = true
        jsPsych.finishTrial(data);
        //curLevel.beginGame()
      }



    }

    /*function occluder(imgPath, x, y){
      //var rand = Math.random()*(par.occluder_images.length-1)
      //alert(par.occluder_images.length-1)
      //this.imgPath = par.occluder_images[rand] //random occluder image

      this.beingShown = false
      this.x = x
      this.y = y
      this.width = null
      this.height = null
      this.imgPath = imgPath

      this.loadImage = function(imgPath){
        this.imgPath = imgPath
      }


      this.show = function() {
        if(!this.beingShown){
          this.beingShown = true
          randomPixel = [Math.round(Math.random()*w), Math.round(Math.random()*h)]
          curLevel.view.showImgAtFor(this.imgPath, randomPixel[0], randomPixel[1], curLevel.timer.getTime(), {objectToNotifyWhenDoneDisplaying: this})
          console.log("occluder object? " + this)
        }
      }
      this.respondToImageBeingCleared = function(){this.beingShown = false}

    }*/

    //game timer. can be reset, told to count down, up, set coundtown time.
    function timer(){
      this.hidden = false, //toggle whether it's displayed
      this.hide = function() {this.hidden = true},
      this.unHide = function() {this.hidden = false}
      this.paused = true
      this.color = "red",
      this.getColor = function(){return this.color},
      this.fontSize =12,
      this.x = w/2, // x positioning
      this.y = h/22,
      this.countdown = true, //default is countdown-mode, not countup-mode
      this.ctdwnTime = par.levelDuration,
      this.setCountdownTime = function(t){this.ctdwnTime = t},
      this.startTime = 0, //null means it hasn't been set
      this.curTime = 1000,
      this.timeHasRunOut = false,
      this.updateCurTime = function(){
        //startDate must be set already for this to work properly.
        this.curTime = new Date().valueOf() - this.startTime

        this.curTimeInSeconds = Math.round(this.curTime % 60000/1000)
            if(this.curTimeInSeconds == this.ctdwnTime && !this.timeHasRunOut /*time hasn't run out yet*/){
              this.timeHasRunOut = true
              curLevel.timeHasRunOut()
              //this.ctdwnTime = -1000 //reset it so it doesn't call timeHasRunOut a million times

            }

      }

      this.reset = function(countdownTime, color) {
        this.setCountdownTime(countdownTime);
        this.startTime = new Date().valueOf(); //0
        this.color = color
        this.updateCurTime()
      }

      //this is sensitive to counting up or down
      this.getTime = function(noupdate/*optional parameter, if true will not update the time before returning the time*/){
        if(noupdate != true) {this.updateCurTime()}
        return (this.countdown) ? this.getTimeTilCountdownEnd() : this.timeElapsed(noupdate)
      }

      //returns how much time has elapsed since the timer has been reset
      this.timeElapsed = function(noupdate){
        if(noupdate != true) {this.updateCurTime()}
        return this.curTime
      }

      this.getTimeTilCountdownEnd = function(noupdate){
        if(noupdate != true) {this.updateCurTime()}
        return this.ctdwnTime*1000 - this.curTime
      }

      this.start = function(){
        this.paused = false;
        this.run()
      }

      this.run = function(){
        setTimeout(function(){
        if(!(curLevel.gameOver() || this.paused)){
        curLevel.timer.updateCurTime();curLevel.view.displayTimer(curLevel.timer); curLevel.timer.run()}}, 1000) //recursive call
      }
      this.pause = function(){this.paused = true}
}


//takes circle's center and radius as arguments. This isn't part of the ball definition because it is used to initialize balls
function circleIsInAnOccluder(center, radius){
  for(var j = 0, occs = par.occluderRectangles, numOccs = occs.length; j < numOccs; j++){
    var occRectPlusBallRadius = {
      x:occs[j].x - radius,
      y:occs[j].y - radius,
      width:occs[j].width + 2*radius,
      height:occs[j].height + 2*radius
    }
    if(pointIsWithinRectangle(center, occRectPlusBallRadius)){return true}
  }


  return false; //never called if true is returned in the loop
}


    function level(model, view, controller, levelDuration) {
      this.timer = new timer()
      this.model = model
      this.view = view
      this.controller = controller,
      this.gameOver = function(){return this.controller.isGameOver()}
      this.update = function(){
        model.update(this.timer.getTime())
        view.update(this.model, this.timer.getTime())
      }
      this.beginGame = function(){
        this.controller.beginGame()
      }

      //begins defusal mode:
      this.defusalMode = function(){
        data.timeDefusalStarted = this.timer.getTime();
        this.model.freeze()
        this.controller.defusalMode()

      }
      this.defusalModeOn = function(){return this.controller.defusalModeOn}
      this.timeHasRunOut = function(){
        if(this.defusalModeOn()){
          this.controller.endGame("defusalModeTimeRanOut")
        }else{
          model.incrementLives(function(){curLevel.view.showLives(curLevel.model.lives);curLevel.controller.defusalMode({deflectionSuccessful: true})})
        }
      }

      this.saveFrame = function(){
        var frame = {
          time: curLevel.timer.timeElapsed(),
          balls: [],
          userObstacles: []
        }

        var balls = this.model.getBalls()
        for(var b = 0, sizeOfBalls = balls.length; b < sizeOfBalls; b++){
          var ball = balls[b]
          frame.balls.push(
            {
              id: ball.id,
              pos: [ball.getX(), ball.getY()]
            }
          )
        }

        for(var o = 0, obstacles = model.userObstacles, numObs = obstacles.length; o < numObs; o++){
          frame.userObstacles.push(
            {
            pixels: obstacles[o].pixels
            })
        }
        data.savedModel.push(frame)
      }

    }

    //currentSavedFrameIndex is incremented after displaying each frame of the saved model
    function replayModeUpdate(currentSavedFrameIndex, currentTime){
      window.requestAnimationFrame(function(){
        curLevel.view.update(makeAFakeModelObjectFromGivenReplayFrame(par.savedModel[currentSavedFrameIndex]), curLevel.timer.getTime())
        window.requestAnimationFrame(replayModeUpdate, currentSavedFrameIndex+1)
      })
      currentSavedFrameIndex++
    }
    //updates normal game, not replayMode
    function updateGame(currentTime){
      curLevel.curTime = currentTime
      if(!curLevel.gameOver()){
      window.requestAnimationFrame(function(){
          curLevel.update();
          curLevel.saveFrame();
          window.requestAnimationFrame(updateGame)
      })
    }
    }


    curLevel.beginGame()
}

  return plugin;
})();
